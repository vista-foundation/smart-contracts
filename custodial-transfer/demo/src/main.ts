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
(window as any).deliverToPartyC = () => {
    console.log('🚚 Global deliverToPartyC called');
    return demo.deliverToPartyC();
};
(window as any).returnToSender = () => {
    console.log('↩️ Global returnToSender called');
    return demo.returnToSender();
};
(window as any).clearLog = () => {
    console.log('🧹 Global clearLog called');
    return demo.clearLog();
};

// Method 2: globalThis assignment as backup
(globalThis as any).depositFunds = (window as any).depositFunds;
(globalThis as any).withdrawFunds = (window as any).withdrawFunds;
(globalThis as any).deliverToPartyC = (window as any).deliverToPartyC;
(globalThis as any).returnToSender = (window as any).returnToSender;
(globalThis as any).clearLog = (window as any).clearLog;

console.log('✅ Global functions setup completed immediately');
console.log('🔍 Available functions:', {
    depositFunds: typeof (window as any).depositFunds,
    withdrawFunds: typeof (window as any).withdrawFunds,
    deliverToPartyC: typeof (window as any).deliverToPartyC,
    returnToSender: typeof (window as any).returnToSender,
    clearLog: typeof (window as any).clearLog
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM loaded, initializing demo...');

    // Verify functions are still available
    console.log('🔍 Functions check after DOM load:', {
        depositFunds: typeof (window as any).depositFunds,
        withdrawFunds: typeof (window as any).withdrawFunds,
        deliverToPartyC: typeof (window as any).deliverToPartyC,
        returnToSender: typeof (window as any).returnToSender,
        clearLog: typeof (window as any).clearLog
    });

    demo.initialize();
});

// Export to make this a module for top-level await
export { };