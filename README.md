# uuid-queue

## Description

I run a [free API](https://uuid.rocks) for generating UUIDs and I wondered: is the API truely generating unique IDs on every request? With 80k requests per day, it's not exactly trivial to find out.

The goal of this project is to receive JSON objects from [uuid.rocks](https://uuid.rocks) (1 per API call) and record them to R2. The hard part about that is we don't want to invoke an R2 Write on every API call. Instead, we want to batch them up and write many at once (to save costs and make the data easier to process later.)

How do we solve this? [Cloudflare Queues](https://blog.cloudflare.com/introducing-cloudflare-queues/)!

## How it works

1. The Worker `fetch` handler receives a JSON object and writes it to a Cloudflare Queue.
2. The Worker `queue` handler is triggered by the Queue and writes batches of JSON object to R2 (in CSV format.)
3. The Worker `scheduled` handler is triggered 3 times per hour and combines all batches from the previous hour into a single CSV file and writes it to R2. This is done to reduce the number of files in R2 and to make it easier to process the data later.

## How it's used

In [uuid.rocks](https://uuid.rocks), I have the following code that's run on API calls to generate new UUIDs:
```typescript
// Function to send a generated UUID to the queue
export async function sendToQueue(id_type: IDType, id: string, env: any) {
  const apiKey = env.QUEUE_API_KEY;
  const url = `https://queue.uuid.rocks?key=${apiKey}`
  const msg: UUIDMessage = {
    ts: new Date().getTime(),
    id_type,
    id
  }
  await fetch(url, { method: 'POST', JSON.stringify(msg) })
}

// How it's called in the uuid.rocks API:
ctx.waitUntil(sendToQueue(format, uuid, env))
```

## Why Cloudflare Queues?

Cloudflare Queues are a great way to batch up per-request data and write it to R2 in batches, saving R2 costs, and making the data easier to process later. Without Queues, we would have to write to R2 on every request, which would be very expensive. One alternative would be to write to a database, but that gets expensive quickly, and often is overkill for data that doesn't need database features when processing.


# Scripts (for my own reference)

These are not meant to be used by anyone else - they are some horrible one-liners that I use to inspect the data in my R2 bucket.

```powershell
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\|%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation)

rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=gci -Recurse -File|%{Import-Csv $_};$x.count;$HashSet = [System.Collections.Generic.HashSet[String]]::new();($x|?{$HashSet.Add($_.id)}).Count


# Get existing from DB via Replit
$existing=(Get-Clipboard)|ConvertFrom-Json 

# Get stats + how many new IDs there are that aren't in the DB
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $existing=(Get-Content .\uuids_oracle\uuids.json)|ConvertFrom-Json; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=(@('uuids', 'uuids_workdir')|%{gci -Recurse -File $_})|%{Import-Csv $_};$x.count;$HashSet = [System.Collections.Generic.HashSet[String]]::new();($x|?{$HashSet.Add($_.id)}).Count; $HashSet2 = [System.Collections.Generic.HashSet[String]]::new(); $existing|%{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")}|Out-Null; $new = ($x|?{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")}); $new.count

# Like above but outputs to a file (excluding the last 10 minutes of missing IDs)
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $existing=(Get-Content .\uuids_oracle\uuids.json)|ConvertFrom-Json; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=(@('uuids', 'uuids_workdir')|%{gci -Recurse -File $_})|%{Import-Csv $_};$x.count;$HashSet = [System.Collections.Generic.HashSet[String]]::new();($x|?{$HashSet.Add($_.id)}).Count; $HashSet2 = [System.Collections.Generic.HashSet[String]]::new(); $existing|%{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")}|Out-Null; $new = ($x|?{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")});$now=[DateTimeOffset]::Now.ToUnixTimeSeconds()*1000;$new|?{$now-$_.ts -gt (60*10*1000)}|Sort-Object{$_.ts}|%{@{ts=[int64]$_.ts; id_type=[int64]$_.id_type; id=$_.id}}|convertto-json|out-file -Encoding utf8 ../missed/uuids-missed.json
```
