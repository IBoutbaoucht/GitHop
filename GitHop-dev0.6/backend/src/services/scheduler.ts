import cron from 'node-cron';
import workerService from './workerService.js';

class Scheduler {
  public start(): void {
    // Update contributors weekly (Sunday at 2 AM)
    cron.schedule('0 2 * * 0', async () => {
      console.log('⏰ Running weekly contributors update...');
      await workerService.updateContributors();
    });

    // Update commit activity daily (Every day at 3 AM)
    cron.schedule('0 3 * * *', async () => {
      console.log('⏰ Running daily commit activity update...');
      await workerService.updateCommitActivity();
    });

    console.log('📅 Cron jobs scheduled successfully!');
  }
}

export default new Scheduler();