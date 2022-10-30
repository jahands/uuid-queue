# copy down and count

```powershell
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\|%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation)

rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=gci -Recurse -File|%{Import-Csv $_};$x.count;$HashSet = [System.Collections.Generic.HashSet[String]]::new();($x|?{$HashSet.Add($_.id)}).Count


# Get existing from DB via Replit
$existing=(Get-Clipboard)|ConvertFrom-Json 

# Get stats + how many new IDs there are that aren't in the DB
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=(@('
uuids', 'uuids_workdir')|%{gci -Recurse -File $_})|%{Import-Csv $_};$x.count;$HashSet = [System.Collections.Generic.HashSet[String]]::new();($x|?{$HashSet.Add($_.id)}).Count; $HashSet2 = [System.Collections.Generic.HashSet[String]]::new(); $existing|%{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")}|Out-Null; $new = ($x|?{$HashSet2.Add("$($_.ts)-$($_.id_type)-$($_.id)")}); $new.count
```
