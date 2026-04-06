$root = Split-Path $PSScriptRoot -Parent

wt --window 0 `
    new-tab --title "Client" --startingDirectory $root powershell -NoExit -Command "npm run dev" `; `
    split-pane --vertical --title "Server" --startingDirectory $root powershell -NoExit -Command "npm run dev:server"
