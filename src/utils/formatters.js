function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return 'Calculando...';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function createProgressBar(progress) {
  const normalizedProgress = Math.min(Math.max(progress, 0), 100);
  const filledLength = Math.max(0, Math.min(20, Math.floor(normalizedProgress / 5)));
  const emptyLength = Math.max(0, 20 - filledLength);
  
  return '▓'.repeat(filledLength) + '░'.repeat(emptyLength);
}

module.exports = {
  formatBytes,
  formatTime,
  createProgressBar
};