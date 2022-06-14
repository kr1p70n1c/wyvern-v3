// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import fs from 'fs';
import { WyvernExchange } from '../typechain-types';

const main = async () => {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    const network: string | undefined | null = process.env.NETWORK;
    if (network === undefined || network === null || network === '') {
        console.error('NETWORK not defined');
        // eslint-disable-next-line no-process-exit
        process.exit();
        return;
    }

    console.log('WyvernExchange about to be deployed to network:', network);

    const wyvernRegistryAddress = '0x5992756B2a35cEEd0c850F54c918698271EF873E';
    const personalSignPrefix = '\x19Ethereum Signed Message:\n';

    const WyvernExchange = await ethers.getContractFactory('WyvernExchange');
    const wyvernExchange: WyvernExchange = (await WyvernExchange.deploy(
        421611,
        [wyvernRegistryAddress],
        Buffer.from(personalSignPrefix, 'binary')
    )) as WyvernExchange;
    await wyvernExchange.deployed();

    console.log(`WyvernExchange deployed to network ${network} with address: `, wyvernExchange.address);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
