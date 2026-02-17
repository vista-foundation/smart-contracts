import './app/polyfills';
import { CustodialTransferDemo } from './app/contract';

// Global instance
const demo = new CustodialTransferDemo();

// Ensure functions are available globally - Set up immediately on script load
console.log('🌐 Setting up global functions immediately...');

// Method 1: Direct window assignment
(window as any).depositFunds = () => {
    console.log('💰 Global depositFunds called');
    return demo.depositFunds();
};
(window as any).withdrawFunds = () => {
    console.log('⬆️ Global withdrawFunds called');
    return demo.withdrawFunds();
};
(window as any).deliverToReceiver = () => {
    console.log('🚚 Global deliverToReceiver called');
    return demo.deliverToReceiver();
};
(window as any).refuseDelivery = () => {
    console.log('❌ Global refuseDelivery called');
    return demo.refuseDelivery();
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
(globalThis as any).depositFunds = (window as any).depositFunds;
(globalThis as any).withdrawFunds = (window as any).withdrawFunds;
(globalThis as any).deliverToReceiver = (window as any).deliverToReceiver;
(globalThis as any).refuseDelivery = (window as any).refuseDelivery;
(globalThis as any).clearLog = (window as any).clearLog;
(globalThis as any).refreshBalances = (window as any).refreshBalances;

console.log('✅ Global functions setup completed immediately');
console.log('🔍 Available functions:', {
    depositFunds: typeof (window as any).depositFunds,
    withdrawFunds: typeof (window as any).withdrawFunds,
    deliverToReceiver: typeof (window as any).deliverToReceiver,
    refuseDelivery: typeof (window as any).refuseDelivery,
    clearLog: typeof (window as any).clearLog,
    refreshBalances: typeof (window as any).refreshBalances
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM loaded, initializing demo...');

    // Verify functions are still available
    console.log('🔍 Functions check after DOM load:', {
        depositFunds: typeof (window as any).depositFunds,
        withdrawFunds: typeof (window as any).withdrawFunds,
        deliverToReceiver: typeof (window as any).deliverToReceiver,
        refuseDelivery: typeof (window as any).refuseDelivery,
        clearLog: typeof (window as any).clearLog,
        refreshBalances: typeof (window as any).refreshBalances
    });

    demo.initialize();
});

// Export to make this a module for top-level await
export { };