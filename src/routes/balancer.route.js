require('dotenv').config()
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';
import express from 'express';

import { latency } from '../services/utils';
import Balancer from '../services/balancer';

const router = express.Router()
const balancer = new Balancer('kovan')

router.get('/price', async (req, res) => {
  const initTime = Date.now()

  // params: tokenIn (required), tokenOut (required), amount (required)
  const tokenIn = req.query.tokenIn
  const tokenOut = req.query.tokenOut
  const amount =  new BigNumber(parseInt(req.query.amount*1e18))

  // fetch the optimal pool mix from balancer-sor
  const { swaps, expectedOut } = await balancer.getSwaps(
    balancer.erc20Tokens[tokenIn], 
    balancer.erc20Tokens[tokenOut], 
    amount,
  )

  res.status(200).json({
    network: balancer.network,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    amount: parseFloat(req.query.amount),
    expectedOut: parseInt(expectedOut)/1e18,
    price: amount / expectedOut,
    swaps: swaps,
  })
})

router.get('/trade', async (req, res) => {
  const initTime = Date.now()
  const privateKey = "0x" + process.env.ETH_PRIVATE_KEY // replace by passing this in as param
  const wallet = new ethers.Wallet(privateKey, balancer.provider)

  // params: tokenIn (required), tokenOut (required), amount (required), maxPrice (optional)
  const tokenIn = req.query.tokenIn
  const tokenOut = req.query.tokenOut
  const amount =  new BigNumber(parseInt(req.query.amount*1e18))
  const amountString = (parseInt(req.query.amount*1e18)).toString()
  let maxPrice
  if (req.query.maxPrice) {
    maxPrice = parseFloat(req.query.maxPrice)
  }

  // fetch the optimal pool mix from balancer-sor and pass them to exchange-proxy
  const { swaps, expectedOut } = await balancer.getSwaps(
    balancer.erc20Tokens[tokenIn], 
    balancer.erc20Tokens[tokenOut], 
    amount
  )
  const price = amount / expectedOut
  if (!maxPrice || price <= maxPrice) {
    // pass swaps to exchange-proxy to complete trade
    const txHash = await balancer.batchSwapExactIn(
      wallet, 
      swaps, 
      balancer.erc20Tokens[tokenIn], 
      balancer.erc20Tokens[tokenOut],
      amountString,
    )

    // submit response
    res.status(200).json({
      network: balancer.network,
      timestamp: initTime,
      latency: latency(initTime, Date.now()),
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amount: parseFloat(req.query.amount),
      expectedOut: expectedOut/1e18,
      price: price,
      txHash: txHash,
    })
  } else {
    console.log(`Swap price ${price} exceeds maxPrice ${maxPrice}`)
  }
})

export default router;
