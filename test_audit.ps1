$content = Get-Content index.html -Raw
$errors = @()

# Check script tags
$scripts = [regex]::Matches($content, '<script[^>]*src=["'']([^"'']+)["'']')
foreach ($s in $scripts) {
    $src = $s.Groups[1].Value
    if ($src -notmatch '^https?://') {
        $cleanPath = $src.TrimStart('.').TrimStart('/\').Replace('/', '\')
        if (-not (Test-Path $cleanPath)) {
            $errors += "Script not found: $src"
        }
    }
}

# Check link css tags
$cssLinks = [regex]::Matches($content, '<link[^>]*rel=["'']stylesheet["''][^>]*href=["'']([^"'']+)["'']')
foreach ($c in $cssLinks) {
    $href = $c.Groups[1].Value
    if ($href -notmatch '^https?://') {
        $cleanPath = $href.TrimStart('.').TrimStart('/\').Replace('/', '\')
        if (-not (Test-Path $cleanPath)) {
            $errors += "CSS file not found: $href"
        }
    }
}

# Check unclosed dialogs
$openDialogs = ([regex]::Matches($content, '<dialog\b')).Count
$closeDialogs = ([regex]::Matches($content, '</dialog>')).Count
if ($openDialogs -ne $closeDialogs) {
    $errors += "Dialog tag mismatch: $openDialogs open vs $closeDialogs closed"
}

# Check data-close-dialog targets
$closeBtns = [regex]::Matches($content, 'data-close-dialog=["'']([^"'']+)["'']')
foreach ($btn in $closeBtns) {
    $targetId = $btn.Groups[1].Value
    if ($content -notmatch "id=['""]" + [regex]::Escape($targetId) + "['""]") {
        $errors += "data-close-dialog target not found: $targetId"
    }
}

$errors
if ($errors.Count -eq 0) { "All asset links, dialogs, and close targets are valid!" }

