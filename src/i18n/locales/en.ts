/**
 * English translations
 * Minimal text as per spec (icon-driven UI)
 */

const en = {
  tabs: {
    home: 'Home',
    pool: 'Pool',
    miners: 'Miners',
    settings: 'Settings',
  },

  common: {
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
    cancel: 'Cancel',
    save: 'Save',
    done: 'Done',
    confirm: 'Confirm',
    offline: 'Offline',
    online: 'Online',
    unknown: 'Unknown',
    noData: 'No data',
    updated: 'Updated {{time}}',
  },

  home: {
    noAddress: 'Add your Bitcoin address to see your stats',
    addAddress: 'Add Address',
    viewAllWorkers: 'View all workers',
    workers: 'Workers',
    hashrate: 'Hashrate',
    bestDiff: 'Best Diff',
    fleet: 'Miner Fleet',
    noMiners: 'No miners configured',
  },

  pool: {
    hashrate: 'Pool Hashrate',
    blocks: 'Blocks Found',
    blocksFound: 'Blocks Found',
    noBlocks: 'No blocks found yet',
    users: 'Users',
    workers: 'Workers',
    lastBlock: 'Last Block',
    uptime: 'Uptime',
    difficulty: 'Difficulty',
    btcPrice: 'BTC Price',
    leaderboard: 'Leaderboard',
    topDifficulty: 'Top Difficulty',
    topLoyalty: 'Top Loyalty',
    yourRank: 'Your Rank',
    chartExpand: 'Tap to expand',
    noEntries: 'No entries yet',
    addAddressHint: 'Add your address in Settings to see your rank',
  },

  miners: {
    title: 'Miners',
    noMiners: 'No miners added yet',
    addMiner: 'Add Miner',
    scanNetwork: 'Scan Network',
    enterIp: 'Enter IP Address',
    restart: 'Restart',
    identify: 'Identify',
    settings: 'Settings',
    remove: 'Remove',
    online: 'Online',
    offline: 'Offline',
    hashrate: 'Hashrate',
    temp: 'Temp',
    power: 'Power',
    uptime: 'Uptime',
    shares: 'Shares',
    bestDiff: 'Best Diff',
    firmware: 'Firmware',
    pool: 'Pool',
    frequency: 'Frequency',
    voltage: 'Voltage',
    fanSpeed: 'Fan Speed',
    auto: 'Auto',
    applyParasite: 'Apply Parasite Preset',
    swipeToRestart: 'Swipe to restart',
    swipeToApply: 'Swipe to apply',
  },

  settings: {
    title: 'Settings',
    bitcoinAddress: 'Bitcoin Address',
    addressPlaceholder: 'Your Bitcoin address',
    scanQr: 'Scan QR',
    temperature: 'Temperature',
    celsius: 'Celsius',
    fahrenheit: 'Fahrenheit',
    pollingInterval: 'Polling Interval',
    seconds: '{{count}}s',
    visibility: 'Leaderboard Visibility',
    public: 'Public',
    private: 'Private',
    about: 'About',
    version: 'Version',
    website: 'Parasite Pool',
    github: 'GitHub',
    invalidAddress: 'Invalid Bitcoin address',
    addressSaved: 'Address saved',
  },

  warnings: {
    tempCaution: 'Temperature warning',
    tempDanger: 'Temperature critical',
    overheat: 'Overheat protection active',
    powerFault: 'Power fault detected',
    lowHashrate: 'Hashrate below expected',
    offline: 'Miner offline',
  },

  time: {
    justNow: 'Just now',
    minutesAgo: '{{count}} min ago',
    hoursAgo: '{{count}}h ago',
    daysAgo: '{{count}}d ago',
  },

  errors: {
    networkError: 'Network error',
    timeout: 'Request timed out',
    minerUnreachable: 'Miner unreachable',
    invalidIp: 'Invalid IP address',
    fetchFailed: 'Failed to fetch data',
  },

  discovery: {
    scanning: 'Scanning network...',
    found: 'Found {{count}} miners',
    noMinersFound: 'No miners found',
    addAll: 'Add All',
  },
} as const;

export default en;

export type TranslationKeys = typeof en;
