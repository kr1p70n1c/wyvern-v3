import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import { NetworkUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-web3';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'solidity-docgen';
import 'hardhat-abi-exporter';

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

const chainIds = {
    ganache: { chainId: 1337, subdomain: 'ganache' },
    goerli: { chainId: 5, subdomain: 'goerli' },
    hardhat: { chainId: 31337, subdomain: 'hardhat' },
    kovan: { chainId: 42, subdomain: 'kovan' },
    mainnet: { chainId: 1, subdomain: 'mainnet' },
    rinkeby: { chainId: 4, subdomain: 'rinkeby' },
    ropsten: { chainId: 3, subdomain: 'ropsten' },
    rinkarby: { chainId: 421611, subdomain: 'arbitrum-rinkeby' },
    pulsechain: { chainId: 940, subdomain: undefined }
};

// Ensure that we have all the environment variables we need.
let mnemonic: string;
if (!process.env.MNEMONIC) {
    throw new Error('Please set your MNEMONIC in a .env file');
} else {
    mnemonic = process.env.MNEMONIC;
}

let infuraApiKey: string;
if (!process.env.INFURA_API_KEY) {
    throw new Error('Please set your INFURA_API_KEY in a .env file');
} else {
    infuraApiKey = process.env.INFURA_API_KEY;
}

const createTestnetConfig = (network: keyof typeof chainIds): NetworkUserConfig => {
    let url: string | undefined;
    if (chainIds[network].subdomain !== undefined) {
        url = 'https://' + chainIds[network].subdomain + '.infura.io/v3/' + infuraApiKey;
    } else {
        if (network === 'pulsechain') {
            url = 'https://rpc.testnet.pulsechain.com';
        }
    }

    if (url === undefined) {
        throw new Error('createTestnetConfig - URL is not set');
    }

    return {
        chainId: chainIds[network].chainId,
        url,
        accounts: getAccounts(network)
    };
};

const getAccounts = (network: keyof typeof chainIds): any => {
    if (network === 'hardhat') {
        if (
            !process.env.HARDHAT_1_PRIVATE_KEY ||
            !process.env.HARDHAT_1_BALANCE_WEI ||
            !process.env.HARDHAT_2_PRIVATE_KEY ||
            !process.env.HARDHAT_2_BALANCE_WEI ||
            !process.env.HARDHAT_3_PRIVATE_KEY ||
            !process.env.HARDHAT_3_BALANCE_WEI ||
            !process.env.HARDHAT_4_PRIVATE_KEY ||
            !process.env.HARDHAT_4_BALANCE_WEI
        ) {
            throw new Error('Please set the required HARDHAT_* in a .env file');
        }
        return [
            { privateKey: process.env.HARDHAT_1_PRIVATE_KEY, balance: process.env.HARDHAT_1_BALANCE_WEI },
            { privateKey: process.env.HARDHAT_2_PRIVATE_KEY, balance: process.env.HARDHAT_2_BALANCE_WEI },
            { privateKey: process.env.HARDHAT_3_PRIVATE_KEY, balance: process.env.HARDHAT_3_BALANCE_WEI },
            { privateKey: process.env.HARDHAT_4_PRIVATE_KEY, balance: process.env.HARDHAT_4_BALANCE_WEI }
        ];
    }
    if (network === 'rinkarby') {
        if (!process.env.RINKARBY_PRIVATE_KEY) {
            throw new Error('Please set your RINKARBY_PRIVATE_KEY in a .env file');
        }
        return [process.env.RINKARBY_PRIVATE_KEY];
    }

    if (network === 'rinkeby') {
        if (!process.env.RINKEBY_PRIVATE_KEY) {
            throw new Error('Please set your RINKEBY_PRIVATE_KEY in a .env file');
        }
        return [process.env.RINKEBY_PRIVATE_KEY];
    }

    return {
        count: 10,
        initialIndex: 0,
        mnemonic,
        path: "m/44'/60'/0'/0"
    };
};

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            // eslint-disable-next-line etc/no-commented-out-code
            // {
            //     version: '0.8.2',
            //     settings: {
            //         optimizer: {
            //             enabled: true,
            //             runs: 200,
            //         },
            //     },
            // },
            {
                version: '0.7.5'
            },
            {
                version: '0.8.13'
                // eslint-disable-next-line etc/no-commented-out-code
                // settings: {},
            }
        ]
    },
    // eslint-disable-next-line etc/no-commented-out-code
    // solidity: '0.8.13',
    networks: {
        hardhat: {
            loggingEnabled: true,
            allowUnlimitedContractSize: true,
            accounts: getAccounts('hardhat')
        },
        ropsten: {
            url: process.env.ROPSTEN_URL || '',
            accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
        },
        rinkeby: createTestnetConfig('rinkeby'),
        rinkarby: createTestnetConfig('rinkarby')
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: 'USD'
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY
    }
};

export default config;
