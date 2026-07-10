param(
  [Parameter(Mandatory = $true)]
  [string]$Git,
  [Parameter(Mandatory = $true)]
  [string]$Branch
)

$token = Read-Host "GitHub personal access token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$exitCode = 1

try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($plainToken)) {
    Write-Error "No token was entered."
    exit 1
  }

  $credentials = "x-access-token:" + $plainToken
  $encodedCredentials = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($credentials))

  # Pass the authorization header through this process only. It is not written to Git config.
  $env:GIT_CONFIG_COUNT = "1"
  $env:GIT_CONFIG_KEY_0 = "http.extraHeader"
  $env:GIT_CONFIG_VALUE_0 = "Authorization: Basic " + $encodedCredentials

  & $Git push -u origin $Branch
  $exitCode = $LASTEXITCODE
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }

  Remove-Item Env:GIT_CONFIG_COUNT -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_CONFIG_KEY_0 -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue
}

exit $exitCode
