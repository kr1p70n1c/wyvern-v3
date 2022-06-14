// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import fs from 'fs';
import { Migrations } from '../typechain-types';

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

    console.log('WyvernStatic about to be deployed to network:', network);

    const Migrations = await ethers.getContractFactory('Migrations');
    const migrations: Migrations = (await Migrations.deploy()) as Migrations;
    await migrations.deployed();

    console.log(`Migrations deployed to network ${network} with address: `, migrations.address);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
