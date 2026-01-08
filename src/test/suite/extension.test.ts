import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Kraken i18n Extension', () => {
  test('registers the open command', async () => {
    const extension = vscode.extensions.getExtension('quira.polyglot-manager');
    assert.ok(extension, 'Extension not found');
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('polyglotManager.open'));
  });
});
