// Import papaparse
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

	async scheduled(event: any, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(runScheduled(env));
	},

}

function subtractHours(numOfHours: number, date = new Date()) {
	date.setHours(date.getHours() - numOfHours);

	return date;
}

async function runScheduled(env: Env) {
	const prefix = 'uuids/' + subtractHours(1).toISOString()
		.replaceAll('-', '/')
		.replace(':', '/')
		.replaceAll(':', '-')
		.replace('.', '-')
		.replace('T', '/')
		.substring(0, 14)
	const newFile = prefix.substring(0, prefix.length - 1) + '.csv'


	const files = await env.UUIDS.list({ prefix })
	const existing = await env.UUIDS.get(newFile)
	let uuids: UUIDMessage[] = []
	if (existing) {
		uuids = Papa.parse<UUIDMessage>(await existing.text()).data
	}
	await Promise.all(files.objects.map(async file => {
		const data = await env.UUIDS.get(file.key)
		if (data) {
			const text = await data.text()
			uuids.push(...Papa.parse<UUIDMessage>(text, { header: true }).data)
		}
	}))

	// Write combined file to r2
	await env.UUIDS.put(newFile, Papa.unparse(uuids))
	// delete old files
	await Promise.all(files.objects.map(async file => {
		await env.UUIDS.delete(file.key)
	}))
}

// Replace this function with your own code!
//
// You can run tasks and batch jobs, such as:
// - Invoking a webhook
// - Storing data in a R2 bucket
// - Sending telemetry data to a provider.
async function runTask(messages: UUIDMessage[], env: Env) {
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
