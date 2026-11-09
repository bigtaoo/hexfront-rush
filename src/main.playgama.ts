import { boot } from './app/boot';
import { SAVE_KEY } from './app/save';
import { PlaygamaPlatform } from './platform/playgama/PlaygamaPlatform';

async function start(): Promise<void> {
  await boot(await PlaygamaPlatform.create([SAVE_KEY]));
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
