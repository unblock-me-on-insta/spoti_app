param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\events-data.js"),
    [int]$MaximumEvents = 40
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseUrl = "https://www.visitljubljana.com"
$sources = @(
    "https://www.visitljubljana.com/en/visitors/events/",
    "https://www.visitljubljana.com/en/visitors/events/events-in-ljubljana/ljubljana-festival/"
)
$monthNumbers = @{ Jan = 1; Feb = 2; Mar = 3; Apr = 4; May = 5; Jun = 6; Jul = 7; Aug = 8; Sep = 9; Sept = 9; Oct = 10; Nov = 11; Dec = 12 }

function Convert-ToPlainText([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return "" }
    $withoutTags = [regex]::Replace($value, "<[^>]+>", " ")
    return [Net.WebUtility]::HtmlDecode($withoutTags) -replace "\s+", " " | ForEach-Object { $_.Trim() }
}

function Convert-EventDate([string]$value) {
    $rangeMatch = [regex]::Match($value, "(?<startDay>\d{1,2})\s+(?<startMonth>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*-\s*(?<endDay>\d{1,2})\s+(?<endMonth>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(?<rangeYear>20\d{2})", "IgnoreCase")
    if ($rangeMatch.Success) {
        $startKey = (Get-Culture).TextInfo.ToTitleCase($rangeMatch.Groups["startMonth"].Value.ToLowerInvariant())
        $endKey = (Get-Culture).TextInfo.ToTitleCase($rangeMatch.Groups["endMonth"].Value.ToLowerInvariant())
        if (-not $monthNumbers.ContainsKey($startKey)) { $startKey = $startKey.Substring(0, 3) }
        if (-not $monthNumbers.ContainsKey($endKey)) { $endKey = $endKey.Substring(0, 3) }
        $year = [int]$rangeMatch.Groups["rangeYear"].Value
        $startDate = Get-Date -Year $year -Month $monthNumbers[$startKey] -Day ([int]$rangeMatch.Groups["startDay"].Value) -Hour 0 -Minute 0 -Second 0
        $endDate = Get-Date -Year $year -Month $monthNumbers[$endKey] -Day ([int]$rangeMatch.Groups["endDay"].Value) -Hour 0 -Minute 0 -Second 0
        $rangeTime = [regex]::Match($value, "(?:at|,)\s*(?<time>\d{1,2}:\d{2})(?:-(?<endTime>\d{1,2}:\d{2}))?", "IgnoreCase")
        return [pscustomobject]@{ Date = $startDate.ToString("yyyy-MM-dd"); EndDate = $endDate.ToString("yyyy-MM-dd"); Time = $(if ($rangeTime.Success) { $rangeTime.Groups["time"].Value.PadLeft(5, "0") } else { "10:00" }); EndTime = $rangeTime.Groups["endTime"].Value }
    }
    $match = [regex]::Match($value, "(?<day>\d{1,2})\s+(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(?<year>20\d{2})(?:\s*(?:at|,)\s*(?<time>\d{1,2}:\d{2})(?:-(?<endTime>\d{1,2}:\d{2}))?)?", "IgnoreCase")
    if (-not $match.Success) { return $null }
    $monthKey = $match.Groups["month"].Value.Substring(0, [Math]::Min(4, $match.Groups["month"].Value.Length))
    $monthKey = (Get-Culture).TextInfo.ToTitleCase($monthKey.ToLowerInvariant())
    if (-not $monthNumbers.ContainsKey($monthKey)) { $monthKey = $monthKey.Substring(0, 3) }
    $date = Get-Date -Year ([int]$match.Groups["year"].Value) -Month $monthNumbers[$monthKey] -Day ([int]$match.Groups["day"].Value) -Hour 0 -Minute 0 -Second 0
    return [pscustomobject]@{ Date = $date.ToString("yyyy-MM-dd"); EndDate = $null; Time = $(if ($match.Groups["time"].Success) { $match.Groups["time"].Value.PadLeft(5, "0") } else { "10:00" }); EndTime = $match.Groups["endTime"].Value }
}

function Get-Category([string]$title) {
    if ($title -match "food|kitchen|flavour|wine|culinar") { return "Hrana" }
    if ($title -match "market|fair|ARTish") { return "Sejem" }
    if ($title -match "parade|outdoor|promenade") { return "Na prostem" }
    if ($title -match "opera|ballet|exhibition|art|theatre|Romeo|Colony|Steps") { return "Kultura" }
    if ($title -match "children|family|library|course") { return ("Dru" + [char]0x017E + "ina") }
    return "Glasba"
}

function Get-Coordinates([string]$place, [string]$seed) {
    $known = @(
        @{ Pattern = "Križanke|Križevniška"; Lat = 46.0467; Lng = 14.5033 },
        @{ Pattern = "Cankarjev dom|Gallus Hall"; Lat = 46.0515; Lng = 14.4994 },
        @{ Pattern = "Slovenian Philharmonic|filharmon"; Lat = 46.0494; Lng = 14.5034 },
        @{ Pattern = "Central Market|Pogačarjev|Kopitarjeva"; Lat = 46.0514; Lng = 14.5107 },
        @{ Pattern = "Cobblers|Čevljarski"; Lat = 46.0473; Lng = 14.5057 },
        @{ Pattern = "National Gallery|Narodna galerija"; Lat = 46.0533; Lng = 14.4990 },
        @{ Pattern = "Novi trg|Breg"; Lat = 46.0479; Lng = 14.5045 },
        @{ Pattern = "Union Hall"; Lat = 46.0555; Lng = 14.5050 }
    )
    foreach ($entry in $known) { if ($place -match $entry.Pattern) { return @($entry.Lat, $entry.Lng) } }
    $hash = [Math]::Abs($seed.GetHashCode())
    $latitude = 46.047 + (($hash % 700) / 100000.0)
    $longitude = 14.499 + ((($hash / 10) % 900) / 100000.0)
    return @($latitude, $longitude)
}

function New-Event([string]$href, [string]$titleHtml, [string]$dateHtml, [string]$descriptionHtml, [string]$imagePath, [string]$contextHtml) {
    $title = Convert-ToPlainText $titleHtml
    $dateText = Convert-ToPlainText $dateHtml
    $parsedDate = Convert-EventDate $dateText
    if (-not $parsedDate -or [string]::IsNullOrWhiteSpace($title)) { return $null }
    $placeMatch = [regex]::Match($dateText, "\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?(?:,\s*|\s+)(?<place>.+)$")
    $place = if ($placeMatch.Success) { $placeMatch.Groups["place"].Value.Trim() } else { "Ljubljana" }
    if ([string]::IsNullOrWhiteSpace($place)) { $place = "Ljubljana" }
    $coordinates = Get-Coordinates $place $title
    $absoluteUrl = if ($href -match "^https?://") { $href } else { "$baseUrl$href" }
    $absoluteImage = if ([string]::IsNullOrWhiteSpace($imagePath)) { "" } elseif ($imagePath -match "^https?://") { $imagePath } else { "$baseUrl$imagePath" }
    $slug = ($absoluteUrl.TrimEnd("/").Split("/")[-1] -replace "[^a-zA-Z0-9-]", "-").ToLowerInvariant()
    return [ordered]@{
        id = "$slug-$($parsedDate.Date)"
        title = $title
        category = Get-Category $title
        date = $parsedDate.Date
        endDate = $parsedDate.EndDate
        startTime = $parsedDate.Time
        endTime = $parsedDate.EndTime
        place = $place
        address = $place
        lat = $coordinates[0]
        lng = $coordinates[1]
        price = $(if ($contextHtml -match "Free admission|Free entrance") { "Prost vstop" } else { "Preveri vir" })
        description = $(if ([string]::IsNullOrWhiteSpace($descriptionHtml)) { "Aktualni dogodek iz uradnega koledarja Visit Ljubljana." } else { Convert-ToPlainText $descriptionHtml })
        image = $absoluteImage
        source = $absoluteUrl
        sourceName = "Visit Ljubljana"
    }
}

$headers = @{ "User-Agent" = "SPOTi Event Indexer/1.0 (+local event discovery prototype)" }
$allEvents = New-Object System.Collections.Generic.List[object]

foreach ($source in $sources) {
    Write-Host "Fetching $source"
    $downloadPath = [IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $source -Headers $headers -UseBasicParsing -TimeoutSec 30 -OutFile $downloadPath
        $html = [IO.File]::ReadAllText($downloadPath, [Text.Encoding]::UTF8)
    } finally {
        Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
    }

    # Standard event cards on the city events index.
    $standardBlocks = [regex]::Matches($html, '<li>\s*<div class="image-wrapper">(?<body>[\s\S]*?)</li>', "IgnoreCase")
    foreach ($block in $standardBlocks) {
        $body = $block.Groups["body"].Value
        $href = [regex]::Match($body, '<a href="(?<v>/en/visitors/events/[^"]+)"').Groups["v"].Value
        $title = [regex]::Match($body, '<h3[^>]*>[\s\S]*?<a[^>]*>(?<v>[\s\S]*?)</a>').Groups["v"].Value
        $dateLocation = [regex]::Match($body, '<div class="event-date-location">(?<v>[\s\S]*?)</div>').Groups["v"].Value
        $description = [regex]::Match($body, '<p>(?<v>[\s\S]*?)</p>').Groups["v"].Value
        $imagePath = [regex]::Match($body, '<img[^>]+src="(?<v>[^"]+)"').Groups["v"].Value
        $item = New-Event $href $title $dateLocation $description $imagePath $body
        if ($item) { $allEvents.Add($item) }
    }

    # Related cards used by the Ljubljana Festival programme.
    $relatedBlocks = [regex]::Matches($html, '<li class="list-grid-3--item">(?<body>[\s\S]*?)</li>', "IgnoreCase")
    foreach ($block in $relatedBlocks) {
        $body = $block.Groups["body"].Value
        $href = [regex]::Match($body, '<a href="(?<v>[^"]+)"').Groups["v"].Value
        $title = [regex]::Match($body, '<h2[^>]*>(?<v>[\s\S]*?)</h2>').Groups["v"].Value
        $dateLocation = [regex]::Match($body, '<strong>(?<v>[\s\S]*?)</strong>').Groups["v"].Value
        $imagePath = [regex]::Match($body, '<img[^>]+src="(?<v>[^"]+)"').Groups["v"].Value
        $item = New-Event $href $title $dateLocation "Aktualni dogodek v programu Ljubljana Festivala." $imagePath $body
        if ($item) { $allEvents.Add($item) }
    }
}

$today = (Get-Date).Date.AddDays(-1)
$latest = $today.AddMonths(8)
$eligibleEvents = foreach ($item in $allEvents) {
    $eventDate = [datetime]::ParseExact($item.date, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
    $eventEndDate = if ($item.endDate) { [datetime]::ParseExact($item.endDate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) } else { $eventDate }
    if ($eventEndDate -ge $today -and $eventDate -le $latest) { $item }
}
$cleanEvents = @($eligibleEvents | Sort-Object { $_.date }, { $_.startTime }, { $_.title } | Select-Object -First $MaximumEvents)

Write-Host "Parsed $($allEvents.Count) dated cards; $(@($cleanEvents).Count) are inside the active date window."
if ($env:SPOTI_DEBUG -eq "1") { Write-Host "Window: $today to $latest"; $allEvents | ForEach-Object { Write-Host "$($_.date) | $($_.title)" } }
if (@($cleanEvents).Count -lt 5) {
    throw "Scraper returned fewer than 5 current events. Existing events-data.js was left unchanged."
}

$json = $cleanEvents | ConvertTo-Json -Depth 5
$meta = [ordered]@{ source = "Visit Ljubljana"; updatedAt = (Get-Date).ToString("o"); automated = $true; count = @($cleanEvents).Count } | ConvertTo-Json -Compress
$javascript = "/* Generated automatically by tools/update-events.ps1. */`nwindow.SPOTI_EVENTS = $json;`nwindow.SPOTI_EVENTS_META = $meta;`n"
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
[IO.File]::WriteAllText($resolvedOutput, $javascript, (New-Object Text.UTF8Encoding($false)))
Write-Host "Wrote $(@($cleanEvents).Count) events to $resolvedOutput"
