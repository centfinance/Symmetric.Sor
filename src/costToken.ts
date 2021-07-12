import { getCreate2Address } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
import { BaseProvider } from '@ethersproject/providers';
import { keccak256, pack } from '@ethersproject/solidity';
import { BigNumber } from './utils/bignumber';
import { BONE } from './bmath';

// UniswapV2Factory address
// Sokol: 0xb19f968c9f74690EC4076Fcde90587dFae02c039
// xDai: 0xA818b4F111Ccac7AA31D0BCc0806d64F2E0737D7
// Kovan: 0x92FacdfB69427CffC1395a7e424AeA91622035Fc
// Alfajores: 0x00Be915B9dCf56a3CBE739D9B9c202ca692409EC
// Celo: 0x00Be915B9dCf56a3CBE739D9B9c202ca692409EC
const FACTORY_ADDRESS = '0x00Be915B9dCf56a3CBE739D9B9c202ca692409EC';
const INIT_CODE_HASH =
    '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';

export function getAddress(tokenA: string, tokenB: string): string {
    const tokens =
        tokenA.toLowerCase() < tokenB.toLowerCase()
            ? [tokenA, tokenB]
            : [tokenB, tokenA];

    let address = getCreate2Address(
        FACTORY_ADDRESS,
        keccak256(
            ['bytes'],
            [pack(['address', 'address'], [tokens[0], tokens[1]])]
        ),
        INIT_CODE_HASH
    );

    return address;
}

export async function getOnChainReserves(
    PairAddr: string,
    provider: BaseProvider
): Promise<any[]> {
    const uniswapV2PairAbi = require('./abi/UniswapV2Pair.json');

    const pairContract = new Contract(PairAddr, uniswapV2PairAbi, provider);

    let [reserve0, reserve1, blockTimestamp] = await pairContract.getReserves();

    return [reserve0, reserve1];
}

export async function getTokenWeiPrice(
    TokenAddr: string,
    provider: BaseProvider
): Promise<BigNumber> {
    // WXDAI on XDAI
    // Sokol: 0xfDc50eF6b67F65Dddc36e56729a9D07BAe1A1f68
    // Kovan: 0xd0A1E359811322d97991E03f863a0C30C2cF029C
    // xDai: 0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1
    // Alfajores: 0x2DEf4285787d58a2f811AF24755A8150622f4361
    // Celo: 0x2DEf4285787d58a2f811AF24755A8150622f4361
    const WETH = '0x2DEf4285787d58a2f811AF24755A8150622f4361';
    if (TokenAddr.toLowerCase() === WETH.toLowerCase())
        return new BigNumber(BONE);

    let addr = getAddress(WETH, TokenAddr);
    let [reserve0, reserve1] = await getOnChainReserves(addr, provider);

    const numerator = new BigNumber(reserve0.toString());
    const denominator = new BigNumber(reserve1.toString());

    const price1eth = numerator.div(denominator);
    return price1eth.times(BONE);
}

export function calculateTotalSwapCost(
    TokenPrice: BigNumber,
    SwapCost: BigNumber,
    GasPriceWei: BigNumber
): BigNumber {
    return GasPriceWei.times(SwapCost)
        .times(TokenPrice)
        .div(BONE);
}

export async function getCostOutputToken(
    TokenAddr: string,
    GasPriceWei: BigNumber,
    SwapGasCost: BigNumber,
    Provider: BaseProvider,
    ChainId: number = undefined
): Promise<BigNumber> {
    if (!ChainId) {
        let network = await Provider.getNetwork();
        ChainId = network.chainId;
    }
    // If not mainnet return 0 as UniSwap price unlikely to be correct?
    // Provider can be used to fetch token data (i.e. Decimals) via UniSwap SDK when Ethers V5 is used
    if (ChainId !== 1) return new BigNumber(0);
    let tokenPrice = new BigNumber(0);
    try {
        tokenPrice = await getTokenWeiPrice(TokenAddr, Provider);
    } catch (err) {
        // console.log(err)
        // If no pool for provided address (or addr incorrect) then default to 0
        console.log('Error Getting Token Price. Defaulting to 0.');
    }

    let costOutputToken = calculateTotalSwapCost(
        tokenPrice,
        SwapGasCost,
        GasPriceWei
    );

    return costOutputToken;
}
