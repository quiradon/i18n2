# Kraken i18n (VS Code Extension)

[![Download VSIX](https://img.shields.io/badge/Download-VSIX-2ea44f?style=for-the-badge)](releases/latest/download/polyglot-manager.vsix)

Edit JSON translation files from a `i18n` folder using a VS Code webview UI.

## Folder Structure

Place language files under a workspace folder like:

```
i18n/
  en.json
  pt-BR.json
```

Keys can be nested objects. The UI uses dot notation for editing.

## Development

1. Install dependencies: `npm install`
2. Build the webview + extension: `npm run build`
3. Launch the extension with VS Code "Run and Debug"

## Tests

Run the extension tests with:

```
npm run test
```

## Settings

- `polyglotManager.i18nFolder` (default: `i18n`)
- `polyglotManager.sourceLanguage` (default: `en`)
