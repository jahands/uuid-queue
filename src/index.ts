import Toucan from "toucan-js"
import Papa from "papaparse"

type UUIDMessage = {
	ts: number
	id_type: number
	id: string
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url)
		// if (url.pathname === '/schedule') {
		// 	await runScheduled(env)
		// 	return new Response('ok')
		// }
		if (request.method === 'POST') {
			const apiKey = url.searchParams.get('key')
			if (apiKey !== env.API_KEY) {
				return new Response('forbidden', { status: 403 })
			}
			const msg: UUIDMessage = await request.json()
			await env.QUEUE.send(msg)
		}
		return new Response("Ok")
	},

	// Invoked when the Worker receives a batch of messages.
	async queue(batch: MessageBatch<UUIDMessage>, env: Env) {
		// Extract the body from each message.
		// Metadata is also available, such as a message id and timestamp.
		const messages: UUIDMessage[] = batch.messages.map((msg) => msg.body)

		await runTask(messages, env);
	},

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

function subtractHours(numOfHours: number, date = new Date()): Date {
	date.setHours(date.getHours() - numOfHours);

	return date;
}

async function runScheduled(env: Env): Promise<void> {
	let processed = 0
	// Check up to 2 hours ago
	for (let i = 2; i >= 1; i--) {
		if (processed > 0) {
			break // only process one hour at a time
		}
		const dupeMap = new Map<string, number>()

		const prefix = 'uuids/' + subtractHours(i).toISOString()
			.replaceAll('-', '/')
			.replace(':', '/')
			.replaceAll(':', '-')
			.replace('.', '-')
			.replace('T', '/')
			.substring(0, 14)
		const newFile = prefix.substring(0, prefix.length - 1) + '.csv'

		const files = await env.UUIDS.list({ prefix })
		if (files.objects.length === 0) {
			continue // Skip to next hour
		}
		processed++ // Track that we found some to process in this hour

		let uuids: UUIDMessage[] = []

		const existing = await env.UUIDS.get(newFile)
		if (existing) {
			uuids = Papa.parse<UUIDMessage>(await existing.text(), { header: true }).data
			// Prevent duplicates
			for (const uuid of uuids) {
				const key = `${uuid.ts}-${uuid.id_type}-${uuid.id}`
				dupeMap.set(key, 1)
			}
		}

		await Promise.all(files.objects.map(async (file) => {
			const data = await env.UUIDS.get(file.key)
			if (data) {
				const text = await data.text()
				const parsed = Papa.parse<UUIDMessage>(text, { header: true }).data
				// Add uuids (preventing duplicates)
				for (const row of parsed) {
					const key = `${row.ts}-${row.id_type}-${row.id}`
					if (!dupeMap.has(key)) {
						dupeMap.set(key, 1)
						uuids.push(row)
					}
				}
			}
		}))

		// Sort uuids by timestamp
		uuids.sort((a, b) => a.ts - b.ts)

		// Write combined file to r2
		await env.UUIDS.put(newFile, Papa.unparse(uuids), { httpMetadata: { contentType: "text/csv" } })
		// delete old files
		const keysToDelete = files.objects.map(file => file.key)
		await env.UUIDS.delete(keysToDelete)
	}
}

// Replace this function with your own code!
//
// You can run tasks and batch jobs, such as:
// - Invoking a webhook
// - Storing data in a R2 bucket
// - Sending telemetry data to a provider.
async function runTask(messages: UUIDMessage[], env: Env): Promise<void> {
	// console.log("Received a batch of", messages.length, "messages:", messages);
	// convert to csv
	const csv = Papa.unparse(messages)
	console.log(csv)
	// upload to r2
	const timestamp = new Date().toISOString()
		.replaceAll('-', '/')
		.replace(':', '/')
		.replaceAll(':', '-')
		.replace('.', '-')
		.replace('T', '/')
	const filename = `uuids/${timestamp}.csv`
	await env.UUIDS.put(filename, csv, { httpMetadata: { contentType: "text/csv" } })
}
