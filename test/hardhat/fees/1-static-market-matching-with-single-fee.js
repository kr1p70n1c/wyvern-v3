const { expect } = require('chai');
const { CHAIN_ID, wrap, ZERO_BYTES32, ZERO_ADDRESS } = require('../../util');
const TestERC20ABI = require('../../../abi/contracts/TestERC20.sol/TestERC20.json');
const TestERC721ABI = require('../../../abi/contracts/TestERC721.sol/TestERC721.json');
const { Kriptou } = require('kriptou.js');
const {
    WyvernProtocolPredicateTransferERC721Exact,
    WyvernProtocolPredicateTransferERC20Exact,
    WyvernProtocolPredicateSequenceAnyAfter,
    WyvernProtocolPredicateSplit,
    WyvernProtocolPredicateSequenceExact,
    WyvernProtocolPredicateTransferERC20ExactTo
} = require('kriptou.js/lib/plugin/wyvern-protocol/predicates');

describe('WyvernExchange', function () {
    it('erc721 <> erc20 with checks - single fee', async function () {
        const deploy_core_contracts = async () => {
            const WyvernRegistry = await ethers.getContractFactory('WyvernRegistry');
            const registry = await WyvernRegistry.deploy();

            const WyvernAtomicizer = await ethers.getContractFactory('WyvernAtomicizer');
            const atomicizer = await WyvernAtomicizer.deploy();

            const WyvernExchange = await ethers.getContractFactory('WyvernExchange');
            const exchange = await WyvernExchange.deploy(CHAIN_ID, [registry.address], '0x');

            const WyvernStatic = await ethers.getContractFactory('WyvernStatic');
            const statici = await WyvernStatic.deploy(atomicizer.address);

            await registry.grantInitialAuthentication(exchange.address);
            return { registry, exchange: wrap(exchange), atomicizer, statici };
        };

        Kriptou.init();

        let [aliceAccount, bobAccount, carolAccount, david] = await ethers.getSigners();
        alice = aliceAccount.address;
        bob = bobAccount.address;
        carol = carolAccount.address;
        david = david.address;
        const { atomicizer, exchange, registry, statici } = await deploy_core_contracts();

        const TestERC20 = await ethers.getContractFactory('TestERC20');
        const erc20 = await TestERC20.deploy();

        const TestERC721 = await ethers.getContractFactory('TestERC721');
        const erc721 = await TestERC721.deploy();

        const abi = [
            {
                constant: false,
                inputs: [
                    { name: 'addrs', type: 'address[]' },
                    { name: 'values', type: 'uint256[]' },
                    { name: 'calldataLengths', type: 'uint256[]' },
                    { name: 'calldatas', type: 'bytes' }
                ],
                name: 'atomicize',
                outputs: [],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
            }
        ];
        const atomicizerc = new web3.eth.Contract(abi, atomicizer.address);

        await registry.registerProxy({ from: alice });
        const aliceProxy = await registry.proxies(alice);
        expect(aliceProxy.length, 'No proxy address for Alice').to.be.greaterThan(0);

        await registry.connect(bobAccount).registerProxy({ from: bob });
        const bobProxy = await registry.proxies(bob);
        expect(bobProxy.length, 'No proxy address for Bob').to.be.greaterThan(0);

        const amount = 1000;
        const fee1 = 10;
        const fee2 = 20;
        const tokenId = 0;

        await Promise.all([erc20.mint(bob, amount + fee1 + fee2), erc721.mint(alice, tokenId)]);

        await Promise.all([
            erc20.connect(bobAccount).approve(bobProxy, amount + fee1 + fee2, { from: bob }),
            erc721.connect(aliceAccount).setApprovalForAll(aliceProxy, true, { from: alice })
        ]);

        const erc20c = new web3.eth.Contract(TestERC20ABI, erc20.address);
        const erc721c = new web3.eth.Contract(TestERC721ABI, erc721.address);

        let call = {};

        {
            // Call should be an ERC721 transfer
            const { selector: selectorCall, extraData: extraDataCall } = Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                new WyvernProtocolPredicateTransferERC721Exact(erc721.address, tokenId)
            );

            const { selector: counterCallSelector1, extraData: counterCallExtraData1 } =
                Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                    new WyvernProtocolPredicateTransferERC20Exact(erc20.address, amount)
                );

            // CounterCall should include an ERC20 transfer
            const { selector: selectorCounterCall, extraData: extraDataCounterCall } =
                Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                    new WyvernProtocolPredicateSequenceAnyAfter(
                        [statici.address],
                        [(counterCallExtraData1.length - 2) / 2],
                        [counterCallSelector1],
                        counterCallExtraData1
                    )
                );

            const { selector: callSelector, extraData: callExtraData } = Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                new WyvernProtocolPredicateSplit(
                    [statici.address, statici.address],
                    [selectorCall, selectorCounterCall],
                    extraDataCall,
                    extraDataCounterCall
                )
            );
            call.selector = callSelector;
            call.extraData = callExtraData;
        }

        const order = {
            registry: registry.address,
            maker: alice,
            staticTarget: statici.address,
            staticSelector: call.selector,
            staticExtradata: call.extraData,
            maximumFill: 1,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '11'
        };
        const orderSignature = exchange.sign2(order, alice, Buffer.from(process.env.HARDHAT_1_PRIVATE_KEY, 'hex'));

        let counterCall = {};
        {
            //// 1
            const { selector: callSelector1, extraData: callExtraData1 } = Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                new WyvernProtocolPredicateTransferERC20Exact(erc20.address, amount)
            );

            //// 2
            const { selector: callSelector2, extraData: callExtraData2 } = Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                new WyvernProtocolPredicateTransferERC20ExactTo(erc20.address, fee1, carol)
            );

            // Call should be an ERC20 transfer to recipient + fees
            const { selector: selectorCall, extraData: extraDataCall } = Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                new WyvernProtocolPredicateSequenceExact(
                    [statici.address, statici.address],
                    [(callExtraData1.length - 2) / 2, (callExtraData2.length - 2) / 2],
                    [callSelector1, callSelector2],
                    callExtraData1 + callExtraData2.slice('2')
                )
            );

            // Countercall should be an ERC721 transfer
            const { selector: selectorCounterCall, extraData: extraDataCounterCall } =
                Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                    new WyvernProtocolPredicateTransferERC721Exact(erc721.address, tokenId)
                );

            const { selector: counterCallSelector, extraData: counterCallExtraData } =
                Kriptou.Plugins.wyvern().getSelectorWithExtraData(
                    new WyvernProtocolPredicateSplit(
                        [statici.address, statici.address],
                        [selectorCall, selectorCounterCall],
                        extraDataCall,
                        extraDataCounterCall
                    )
                );

            counterCall.selector = counterCallSelector;
            counterCall.extraData = counterCallExtraData;
        }

        const counterOrder = {
            registry: registry.address,
            maker: bob,
            staticTarget: statici.address,
            staticSelector: counterCall.selector,
            staticExtradata: counterCall.extraData,
            maximumFill: amount,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '12'
        };

        const counterOrderSignature = exchange.sign2(counterOrder, bob, Buffer.from(process.env.HARDHAT_2_PRIVATE_KEY, 'hex'));

        const firstData = erc721c.methods.transferFrom(alice, bob, tokenId).encodeABI();

        const c1 = erc20c.methods.transferFrom(bob, alice, amount).encodeABI();
        const c2 = erc20c.methods.transferFrom(bob, carol, fee1).encodeABI();
        const secondData = atomicizerc.methods
            .atomicize([erc20.address, erc20.address], [0, 0], [(c1.length - 2) / 2, (c2.length - 2) / 2], c1 + c2.slice('2'))
            .encodeABI();

        const orderCall = { target: erc721.address, howToCall: 0, data: firstData };
        const counterOrderCall = {
            target: atomicizer.address,
            howToCall: 1,
            data: secondData
        };

        await exchange.atomicMatchWith2(
            order,
            orderSignature,
            orderCall,
            counterOrder,
            counterOrderSignature,
            counterOrderCall,
            ZERO_BYTES32,
            { from: carol },
            carolAccount
        );

        const [aliceErc20Balance, carolErc20Balance, davidErc20Balance, tokenIdOwner] = await Promise.all([
            erc20.balanceOf(alice),
            erc20.balanceOf(carol),
            erc20.balanceOf(david),
            erc721.ownerOf(tokenId)
        ]);
        expect(aliceErc20Balance.toNumber(), 'Incorrect ERC20 balance').to.equals(amount);
        expect(carolErc20Balance.toNumber(), 'Incorrect ERC20 balance').to.equals(fee1);
        // David does not receive a fee
        expect(davidErc20Balance.toNumber(), 'Incorrect ERC20 balance').to.equals(0);
        expect(tokenIdOwner, 'Incorrect token owner').to.equals(bob);
    });
});
