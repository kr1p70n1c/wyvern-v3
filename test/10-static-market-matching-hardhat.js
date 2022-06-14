/* global artifacts:false, it:false, contract:false, assert:false */

const Web3 = require('web3');
const provider = new Web3.providers.HttpProvider('http://localhost:8545');
const web3 = new Web3(provider);

const { wrap, ZERO_BYTES32, CHAIN_ID, ZERO_ADDRESS, assertIsRejected } = require('./util');
const { expect } = require('chai');
const TestERC20ABI = require('../abi/contracts/TestERC20.sol/TestERC20.json');
const TestERC721ABI = require('../abi/contracts/TestERC721.sol/TestERC721.json');

describe('WyvernExchange', function () {
    const deploy_core_contracts = async () => {
        const WyvernRegistry = await ethers.getContractFactory('WyvernRegistry');
        const registry = await WyvernRegistry.deploy();

        const WyvernAtomicizer = await ethers.getContractFactory('WyvernAtomicizer');
        const atomicizer = await WyvernAtomicizer.deploy();

        const WyvernExchange = await ethers.getContractFactory('WyvernExchange');
        const exchange = await WyvernExchange.deploy(CHAIN_ID, [registry.address], '0x');

        const StaticMarket = await ethers.getContractFactory('StaticMarket');
        const statici = await StaticMarket.deploy();

        await registry.grantInitialAuthentication(exchange.address);
        return { registry, exchange: wrap(exchange), atomicizer, statici };
    };

    let deploy = async (contracts) => Promise.all(contracts.map((contract) => contract.new()));

    const erc721_for_erc20_test = async (options) => {
        const { tokenId, buyTokenId, sellingPrice, buyingPrice, erc20MintAmount, account_a, account_b, account_c, misc } =
            options;

        const { atomicizer, exchange, registry, statici } = await deploy_core_contracts();

        const TestERC20 = await ethers.getContractFactory('TestERC20');
        const erc20 = await TestERC20.deploy();

        const TestERC721 = await ethers.getContractFactory('TestERC721');
        const erc721 = await TestERC721.deploy();

        await registry.registerProxy({ from: account_a });
        let proxy1 = await registry.proxies(account_a);
        expect(proxy1.length, 'No proxy address for account a').to.be.greaterThan(0);

        await registry.connect(misc.accountB).registerProxy({ from: account_b });
        let proxy2 = await registry.proxies(account_b);
        expect(proxy2.length, 'No proxy address for account b').to.be.greaterThan(0);

        await Promise.all([
            erc721.setApprovalForAll(proxy1, true, { from: account_a }),
            erc20.connect(misc.accountB).approve(proxy2, erc20MintAmount, { from: account_b })
        ]);
        await Promise.all([erc721.mint(account_a, tokenId), erc20.mint(account_b, erc20MintAmount)]);

        if (buyTokenId) await erc721.mint(account_a, buyTokenId);

        const erc20c = new web3.eth.Contract(TestERC20ABI, erc20.address);
        const erc721c = new web3.eth.Contract(TestERC721ABI, erc721.address);

        const selectorOne = web3.eth.abi.encodeFunctionSignature(
            'ERC721ForERC20(bytes,address[7],uint8[2],uint256[6],bytes,bytes)'
        );
        const selectorTwo = web3.eth.abi.encodeFunctionSignature(
            'ERC20ForERC721(bytes,address[7],uint8[2],uint256[6],bytes,bytes)'
        );

        const paramsOne = web3.eth.abi.encodeParameters(
            ['address[2]', 'uint256[2]'],
            [
                [erc721.address, erc20.address],
                [tokenId, sellingPrice]
            ]
        );

        const paramsTwo = web3.eth.abi.encodeParameters(
            ['address[2]', 'uint256[2]'],
            [
                [erc20.address, erc721.address],
                [buyTokenId || tokenId, buyingPrice]
            ]
        );
        const one = {
            registry: registry.address,
            maker: account_a,
            staticTarget: statici.address,
            staticSelector: selectorOne,
            staticExtradata: paramsOne,
            // staticTarget: ZERO_ADDRESS,
            // staticSelector: '0x00000000',
            // staticExtradata: '0x',
            maximumFill: 1,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '11'
            // expirationTime: '0',
            // salt: '0'
        };
        const two = {
            registry: registry.address,
            maker: account_b,
            staticTarget: statici.address,
            staticSelector: selectorTwo,
            staticExtradata: paramsTwo,
            // staticTarget: ZERO_ADDRESS,
            // staticSelector: '0x00000000',
            // staticExtradata: '0x',
            maximumFill: 1,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '12'
            // expirationTime: '0',
            // salt: '0'
        };

        const firstData = erc721c.methods.transferFrom(account_a, account_b, tokenId).encodeABI();
        const secondData = erc20c.methods.transferFrom(account_b, account_a, buyingPrice).encodeABI();

        const firstCall = { target: erc721.address, howToCall: 0, data: firstData };
        const secondCall = { target: erc20.address, howToCall: 0, data: secondData };

        let sigOne = exchange.sign2(one, account_a, Buffer.from(process.env.HARDHAT_1_PRIVATE_KEY, 'hex'));
        let sigTwo = exchange.sign2(two, account_b, Buffer.from(process.env.HARDHAT_2_PRIVATE_KEY, 'hex'));
        await exchange.atomicMatchWith2(
            one,
            sigOne,
            firstCall,
            two,
            sigTwo,
            secondCall,
            ZERO_BYTES32,
            { from: account_c },
            misc.accountC
        );

        let [account_a_erc20_balance, token_owner] = await Promise.all([erc20.balanceOf(account_a), erc721.ownerOf(tokenId)]);
        expect(account_a_erc20_balance.toNumber(), 'Incorrect ERC20 balance').to.equals(sellingPrice);
        expect(token_owner, 'Incorrect token owner').to.equals(account_b);
    };

    it('StaticMarket: matches erc721 <> erc20 order', async function () {
        const price = 15000;
        let accounts = await ethers.getSigners();

        return erc721_for_erc20_test({
            tokenId: 10,
            sellingPrice: price,
            buyingPrice: price,
            erc20MintAmount: price,
            account_a: accounts[0].address,
            account_b: accounts[1].address,
            account_c: accounts[2].address,
            misc: {
                accountA: accounts[0],
                accountB: accounts[1],
                accountC: accounts[2]
            }
        });
    });
});
