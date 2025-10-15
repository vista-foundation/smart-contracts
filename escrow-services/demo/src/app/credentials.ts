export const credentials = {
    PartyA: {
        seed: 'wild wreck ill odor often shift magic manage admit dwarf law input reason cable between pool task tuition romance garment cargo duck person top',
        address: 'addr_test1qqa87az35xekhtstdu0g3jaf7j876l7d36tw42w09c5jmg75q93dmghaearnkgkd74gxtxxtt6glhv5eyj6gg3hplz9s70m5zn'
    },
    PartyB: {
        seed: 'person holiday hawk federal comic noise resist broken front link believe panel volume nominee feed patrol history assume virus vast river please cable seed',
        address: 'addr_test1qpcvn6shugfpts2v7xjv5929dphdsht9ana763zy306ej2036vmla2rgq8xfpzy94r04f07qng9gk2jayarxwnyuu2vqq2uqjp'
    },
    PartyC: {
        seed: 'wreck bid swear pumpkin brain course job across figure blue weird absent switch reopen hurt someone empower silly because section section list decorate youth',
        address: 'addr_test1qrfvuy6u70qkucamwkwdy0l6crfjke5q8z9xtw60vslk2xljxy3aw0rut0nlsyw7as0luh84j0rayg5akywkendvrnys4efl0q'
    }
}

// Hardcoded test passphrases for demo purposes
// Party mapping: A=Depositor, B=Beneficiary, C=Authorized Key/Fee Recipient
export const DEPOSITOR_PASSPHRASE = credentials.PartyA.seed;
export const BENEFICIARY_PASSPHRASE = credentials.PartyB.seed;
export const AUTHORIZED_PASSPHRASE = credentials.PartyC.seed;
export const DEPOSITOR_ADDRESS = credentials.PartyA.address;
export const BENEFICIARY_ADDRESS = credentials.PartyB.address;
export const AUTHORIZED_ADDRESS = credentials.PartyC.address;
