import Toucan from "toucan-js"
import Papa from "papaparse"
import { Env, UUIDMessage } from "./types"
import { subtractHours, isUUIDMessage, getDedupeKey } from "./utils"

export default {
	// Invoked via HTTP request
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url)
		if (request.method === 'POST') {
			// Simple API key auth
			const apiKey = url.searchParams.get('key')
			if (apiKey !== env.API_KEY) {
				return new Response('forbidden', { status: 403 })
			}
			// The caller should be sending a single UUIDMessage object
			const msg: any = await request.json()
			if (isUUIDMessage(msg)) {
				// Send valid messages to the queue
				await env.QUEUE.send(msg)
			} else {
				return Response.json({ error: 'invalid message' }, { status: 400 })
			}
		}
		return new Response("Ok")
	},

	// Invoked when the Worker receives a batch of messages from the Queue
	async queue(batch: MessageBatch<UUIDMessage>, env: Env) {
		// Extract the body from each message.
		// Metadata is also available, such as a message id and timestamp.
		const messages: UUIDMessage[] = batch.messages.map((msg) => msg.body)

		await processBatch(messages, env);
	},

	// Invoked 3 times per hour via cron (see crons in wrangler.toml)
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const sentry = new Toucan({
			dsn: env.SENTRY_DSN,
			context: event
		});

		try {
			await runScheduled(env)
		} catch (err) {
			sentry.captureException(err);
		}
	},

}

/**
 * This cron job runs 3 times per hour and combines the IDs into a single file
 * per hour. This is to reduce the number of files in the bucket, making it
 * easier to process later.
 * @param env - needed for the R2 binding
 */
async function runScheduled(env: Env): Promise<void> {
	let processed = 0
	// Check up to 2 hours ago
	for (let i = 2; i >= 1; i--) {
		// only process one hour at a time since there are limits to
		// how many reads/writes we can make to R2 in a single run
		if (processed > 0) {
			break
		}

		// Create a map for deduplication just in case
		// multiple batches have a duplicated message (Queues is at-least-once)
		const dupeMap = new Map<string, number>()

		// Get the prefix in R2 where the files are stored (1-2 hours ago)
		// Eg. uuids_workdir/2022/11/01/12/
		// Files are stored in the format:
		//     uuids_workdir/2022/11/01/12/42-18-935Z.csv
		const prefix = 'uuids_workdir/' + subtractHours(i).toISOString()
			.replaceAll('-', '/')
			.replace(':', '/')
			.replaceAll(':', '-')
			.replace('.', '-')
			.replace('T', '/')
			.substring(0, 14)

		// Create a new file for the entire hour:
		// Eg. uuids/2022/11/01/12.csv
		const newFile = prefix.substring(0, prefix.length - 1).replace('_workdir', '') + '.csv'

		// List all files in the prefix where the files are stored every ~10-30 seconds
		const files = await env.UUIDS.list({ prefix })
		if (files.objects.length === 0) {
			continue // Skip to next hour
		}
		processed++ // Track that we found some to process in this hour

		// Var to store the combined CSV
		let uuids: UUIDMessage[] = []

		// CSV parse options
		const parseOptions = {
			header: true, // First row is the header
			dynamicTyping: true // Convert numbers from string to js numbers
		}

		// We run the cron multiple times per hour, so there
		// may already be a file for this hour. If so, we need
		// to read it and add it to the uuids array
		const existing = await env.UUIDS.get(newFile)
		if (existing) {
			uuids = Papa.parse<UUIDMessage>(await existing.text(), parseOptions).data
			// Prevent duplicates
			for (const uuid of uuids) {
				// dedupe by ts, id_type, and id
				dupeMap.set(getDedupeKey(uuid), 1)
			}
		}

		await Promise.all(files.objects.map(async (file) => {
			const data = await env.UUIDS.get(file.key)
			if (data) {
				const text = await data.text()
				const parsed = Papa.parse<UUIDMessage>(text, parseOptions).data
				// Add uuids (preventing duplicates)
				for (const row of parsed) {
					// Make sure it's a valid UUIDMessage before adding
					if (isUUIDMessage(row)) {
						const key = getDedupeKey(row)
						if (!dupeMap.has(key)) {
							dupeMap.set(key, 1)
							uuids.push(row)
						}
					}
				}
			}
		}))

		// Sort uuids by timestamp
		uuids.sort((a, b) => a.ts - b.ts)

		// Write combined csv file to R2 (filter out incorrect objects, just in case)
		await env.UUIDS.put(newFile, Papa.unparse(uuids.filter((uuid) => isUUIDMessage(uuid))),
			{ httpMetadata: { contentType: "text/csv" } })

		// delete old files that we've combined
		const keysToDelete = files.objects.map(file => file.key)
		await env.UUIDS.delete(keysToDelete)
	}
}

/**
 * Processes a batch of messages when received from the queue in the consumer
 * @param messages - messages from the batch
 * @param env - needed for the R2 binding
 */
async function processBatch(messages: UUIDMessage[], env: Env): Promise<void> {
	// convert to csv (making sure it's a valid UUIDMessage first)
	const csv = Papa.unparse(messages.filter((uuid) => isUUIDMessage(uuid)))
	console.log(csv)

	// Create a timestamp: 2022/11/01/13/42-18-935Z
	const timestamp = new Date().toISOString()
		.replaceAll('-', '/')
		.replace(':', '/')
		.replaceAll(':', '-')
		.replace('.', '-')
		.replace('T', '/')

	// Filename to save to R2
	// Eg. uuids_workdir/2022/11/01/13/42-18-935Z.csv
	const filename = `uuids_workdir/${timestamp}.csv`

	// upload to r2
	await env.UUIDS.put(filename, csv, { httpMetadata: { contentType: "text/csv" } })
}
