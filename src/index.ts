// Import papaparse
import Papa from "papaparse"

type UUIDMessage = {
	id_type: number
	id: string
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		if (request.method === 'POST') {
			const url = new URL(request.url)
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
		.replaceAll(':', '-')
		.replace('.', '-')
		.replace('T', '/')
	const filename = `uuids/${timestamp}.csv`
	await env.UUIDS.put(filename, csv, { httpMetadata: { contentType: "text/csv" } })
	// const parsedMessages = messages.map((message) => JSON.parse(message) as UUIDMessage)
	// If the task fails, the batch will be retried.
	// You can configure the max_retries in the `wrangler.toml`.
	await new Promise((resolve) => setTimeout(resolve, 3000, []));
}
