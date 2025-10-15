import './app/polyfills';
import { EscrowServicesDemo } from './app/contract';

// Global instance
const demo = new EscrowServicesDemo();

// Ensure functions are available globally - Set up immediately on script load
console.log('🌐 Setting up global functions immediately...');

// Method 1: Direct window assignment
(window as any).createTimeLockEscrow = () => {
    console.log('⏰ Global createTimeLockEscrow called');
    return demo.createTimeLockEscrow();
};
(window as any).releaseTimeLockEscrow = () => {
    console.log('🔓 Global releaseTimeLockEscrow called');
    return demo.releaseTimeLockEscrow();
};
(window as any).createMultiSigEscrow = () => {
    console.log('🔑 Global createMultiSigEscrow called');
    return demo.createMultiSigEscrow();
};
(window as any).releaseMultiSigEscrow = () => {
    console.log('🔓 Global releaseMultiSigEscrow called');
    return demo.releaseMultiSigEscrow();
};
(window as any).clearLog = () => {
    console.log('🧹 Global clearLog called');
    return demo.clearLog();
};
(window as any).refreshBalances = () => {
    console.log('🔄 Global refreshBalances called');
    return demo.refreshBalances();
};

// Method 2: globalThis assignment as backup
(globalThis as any).createTimeLockEscrow = (window as any).createTimeLockEscrow;
(globalThis as any).releaseTimeLockEscrow = (window as any).releaseTimeLockEscrow;
(globalThis as any).createMultiSigEscrow = (window as any).createMultiSigEscrow;
(globalThis as any).releaseMultiSigEscrow = (window as any).releaseMultiSigEscrow;
(globalThis as any).clearLog = (window as any).clearLog;
(globalThis as any).refreshBalances = (window as any).refreshBalances;

console.log('✅ Global functions setup completed immediately');
console.log('🔍 Available functions:', {
    createTimeLockEscrow: typeof (window as any).createTimeLockEscrow,
    releaseTimeLockEscrow: typeof (window as any).releaseTimeLockEscrow,
    createMultiSigEscrow: typeof (window as any).createMultiSigEscrow,
    releaseMultiSigEscrow: typeof (window as any).releaseMultiSigEscrow,
    clearLog: typeof (window as any).clearLog,
    refreshBalances: typeof (window as any).refreshBalances
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM loaded, initializing demo...');

    // Verify functions are still available
    console.log('🔍 Functions check after DOM load:', {
        createTimeLockEscrow: typeof (window as any).createTimeLockEscrow,
        releaseTimeLockEscrow: typeof (window as any).releaseTimeLockEscrow,
        createMultiSigEscrow: typeof (window as any).createMultiSigEscrow,
        releaseMultiSigEscrow: typeof (window as any).releaseMultiSigEscrow,
        clearLog: typeof (window as any).clearLog,
        refreshBalances: typeof (window as any).refreshBalances
    });

    demo.initialize();
});

// Export to make this a module for top-level await
export { };
