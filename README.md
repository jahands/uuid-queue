# copy down and count

```shell
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\|%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation)

rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids_workdir\ |%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=gci -Recurse -File .\uuids_workdir\|%{Import-Csv $_};$x.count; ($x.id|select -Unique).Count
```
