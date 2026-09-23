$html = Get-Content index.html -Raw
$jsFiles = Get-ChildItem -Path . -Filter *.js -Recurse | Where-Object { $_.FullName -notmatch "node_modules|\.git" }
$missing = @()

foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    $regexMatches = [regex]::Matches($content, "(?:\$|getElementById)\(\s*['""]([a-zA-Z0-9_-]+)['""]\s*\)")
    foreach ($m in $regexMatches) {
        $id = $m.Groups[1].Value
        $pattern = "id=['""]" + [regex]::Escape($id) + "['""]"
        if ($html -notmatch $pattern) {
            $missing += [PSCustomObject]@{
                File = $file.Name
                ID = $id
            }
        }
    }
}

$missing | Group-Object ID | ForEach-Object {
    [PSCustomObject]@{
        ID = $_.Name
        Count = $_.Count
        Files = ($_.Group | Select-Object -ExpandProperty File -Unique) -join ", "
    }
} | Format-Table -AutoSize

