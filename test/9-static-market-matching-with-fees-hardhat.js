const { expect } = require('chai');
const { CHAIN_ID, wrap, ZERO_BYTES32, ZERO_ADDRESS } = require('./util');
const TestERC20ABI = require('../abi/contracts/TestERC20.sol/TestERC20.json');
const TestERC721ABI = require('../abi/contracts/TestERC721.sol/TestERC721.json');

describe('WyvernExchange', function () {
    it('erc721 <> erc20 with checks', async function () {
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

        let selectorOne, extradataOne;
        {
            const selector = web3.eth.abi.encodeFunctionSignature('split(bytes,address[7],uint8[2],uint256[6],bytes,bytes)');
            // Call should be an ERC721 transfer
            const selectorCall = web3.eth.abi.encodeFunctionSignature(
                'transferERC721Exact(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const extradataCall = web3.eth.abi.encodeParameters(['address', 'uint256'], [erc721.address, tokenId]);
            // Countercall should include an ERC20 transfer
            const selectorCountercall = web3.eth.abi.encodeFunctionSignature(
                'sequenceAnyAfter(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const countercallSelector1 = web3.eth.abi.encodeFunctionSignature(
                'transferERC20Exact(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const countercallExtradata1 = web3.eth.abi.encodeParameters(['address', 'uint256'], [erc20.address, amount]);
            const extradataCountercall = web3.eth.abi.encodeParameters(
                ['address[]', 'uint256[]', 'bytes4[]', 'bytes'],
                [[statici.address], [(countercallExtradata1.length - 2) / 2], [countercallSelector1], countercallExtradata1]
            );

            const params = web3.eth.abi.encodeParameters(
                ['address[2]', 'bytes4[2]', 'bytes', 'bytes'],
                [[statici.address, statici.address], [selectorCall, selectorCountercall], extradataCall, extradataCountercall]
            );

            selectorOne = selector;
            extradataOne = params;
        }

        const one = {
            registry: registry.address,
            maker: alice,
            staticTarget: statici.address,
            staticSelector: selectorOne,
            staticExtradata: extradataOne,
            // staticTarget: ZERO_ADDRESS,
            // staticSelector: '0x00000000',
            // staticExtradata: '0x',
            maximumFill: 1,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '11'
        };
        const sigOne = exchange.sign2(one, alice, Buffer.from(process.env.HARDHAT_1_PRIVATE_KEY, 'hex'));

        let selectorTwo, extradataTwo;
        {
            const selector = web3.eth.abi.encodeFunctionSignature('split(bytes,address[7],uint8[2],uint256[6],bytes,bytes)');
            // Call should be an ERC20 transfer to recipient + fees
            const selectorCall = web3.eth.abi.encodeFunctionSignature('sequenceExact(bytes,address[7],uint8,uint256[6],bytes)');
            const callSelector1 = web3.eth.abi.encodeFunctionSignature(
                'transferERC20Exact(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const callExtradata1 = web3.eth.abi.encodeParameters(['address', 'uint256'], [erc20.address, amount]);
            const callSelector2 = web3.eth.abi.encodeFunctionSignature(
                'transferERC20ExactTo(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const callExtradata2 = web3.eth.abi.encodeParameters(['address', 'uint256', 'address'], [erc20.address, fee1, carol]);
            const callSelector3 = web3.eth.abi.encodeFunctionSignature(
                'transferERC20ExactTo(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const callExtradata3 = web3.eth.abi.encodeParameters(['address', 'uint256', 'address'], [erc20.address, fee2, david]);
            const extradataCall = web3.eth.abi.encodeParameters(
                ['address[]', 'uint256[]', 'bytes4[]', 'bytes'],
                [
                    [statici.address, statici.address, statici.address],
                    [(callExtradata1.length - 2) / 2, (callExtradata2.length - 2) / 2, (callExtradata3.length - 2) / 2],
                    [callSelector1, callSelector2, callSelector3],
                    callExtradata1 + callExtradata2.slice('2') + callExtradata3.slice('2')
                ]
            );
            // Countercall should be an ERC721 transfer
            const selectorCountercall = web3.eth.abi.encodeFunctionSignature(
                'transferERC721Exact(bytes,address[7],uint8,uint256[6],bytes)'
            );
            const extradataCountercall = web3.eth.abi.encodeParameters(['address', 'uint256'], [erc721.address, tokenId]);

            const params = web3.eth.abi.encodeParameters(
                ['address[2]', 'bytes4[2]', 'bytes', 'bytes'],
                [[statici.address, statici.address], [selectorCall, selectorCountercall], extradataCall, extradataCountercall]
            );

            selectorTwo = selector;
            extradataTwo = params;
        }

        const two = {
            registry: registry.address,
            maker: bob,
            staticTarget: statici.address,
            staticSelector: selectorTwo,
            staticExtradata: extradataTwo,
            // staticTarget: ZERO_ADDRESS,
            // staticSelector: '0x00000000',
            // staticExtradata: '0x',
            maximumFill: amount,
            listingTime: '0',
            expirationTime: '10000000000',
            salt: '12'
        };

        const sigTwo = exchange.sign2(two, bob, Buffer.from(process.env.HARDHAT_2_PRIVATE_KEY, 'hex'));

        const firstData = erc721c.methods.transferFrom(alice, bob, tokenId).encodeABI();

        const c1 = erc20c.methods.transferFrom(bob, alice, amount).encodeABI();
        const c2 = erc20c.methods.transferFrom(bob, carol, fee1).encodeABI();
        const c3 = erc20c.methods.transferFrom(bob, david, fee2).encodeABI();
        const secondData = atomicizerc.methods
            .atomicize(
                [erc20.address, erc20.address, erc20.address],
                [0, 0, 0],
                [(c1.length - 2) / 2, (c2.length - 2) / 2, (c3.length - 2) / 2],
                c1 + c2.slice('2') + c3.slice('2')
            )
            .encodeABI();

        const firstCall = { target: erc721.address, howToCall: 0, data: firstData };
        const secondCall = {
            target: atomicizer.address,
            howToCall: 1,
            data: secondData
        };

        await exchange.atomicMatchWith2(
            one,
            sigOne,
            firstCall,
            two,
            sigTwo,
            secondCall,
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
        expect(davidErc20Balance.toNumber(), 'Incorrect ERC20 balance').to.equals(fee2);
        expect(tokenIdOwner, 'Incorrect token owner').to.equals(bob);
    });
});
