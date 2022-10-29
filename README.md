# copy down and count

```shell
rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids\2022\*\*\*\*\*|%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation)

rclone sync --fast-list r2:uuids . --transfers=20 --size-only; $x=(gci -Recurse -File .\uuids\2022\*\*\*\*\*|%{(import-csv $_).Count});($x|Measure-Object -Sum -Average -Minimum -Maximum -StandardDeviation); $x=gci -Recurse -File|%{Import-Csv $_};$x.count; ($x.id|select -Unique).Count
```
