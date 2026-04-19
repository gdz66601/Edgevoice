import { nextDailyUtcHour } from '../utils.js';
import { runScheduledGc } from '../gc.js';

export class Scheduler {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch() {
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(nextDailyUtcHour(3));
    }

    return new Response('ok');
  }

  async alarm() {
    await runScheduledGc(this.env);

    await this.state.storage.setAlarm(nextDailyUtcHour(3));
  }
}
