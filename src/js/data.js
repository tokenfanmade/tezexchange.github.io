import { CONTRACTS, TOKENS, getContract } from './contracts.js'
import { enc58, makePlain } from './helper.js'

export const TIPS = []
export function showTip(is_success, content) {
  TIPS.unshift({mode: (is_success ? 'success' : 'error'), content})
  setTimeout(() => {
    TIPS.pop()
  }, 5000)
}

export const DATA = {
  pkh: '',
  ready: false,
  tes_reward_lst: [],
  orders: {},
  my_orders: {}
}

setInterval(() => {
  if (!DATA.ready) return false
  if (!document.hasFocus()) return false

  dataRefresh()
}, 10 * 1000)

export function dataReady() {
  if (DATA.ready)
    return Promise.resolve(DATA)
  else 
    return dataRefresh()
}

export function dataRefresh() {
  return updateOrders()
  .then(() => {
    updateMyOrders()
  })
}

export function updateMyOrders() {
  return Promise.all([dataReady(), tezbridge({method: 'public_key_hash', noalert: true})])
  .then(([_, pkh]) => {
    if (!pkh) return Promise.reject()

    DATA.pkh = pkh

    const my_orders = {}
    for (const name in DATA.orders) {
      my_orders[name] = []

      DATA.orders[name].buying.forEach(x => {
        if (x.owner === pkh)
          my_orders[name].push(x)
      })
      DATA.orders[name].selling.forEach(x => {
        if (x.owner === pkh)
          my_orders[name].push(x)
      })
    }

    DATA.my_orders = my_orders
    return DATA.my_orders
  })
}

export function updateOrders() {
  return tezbridge({method: 'raw_storage', contract: getContract('main')})
  .then(x => {
    const order_lst = Object.values(x.big_map).map(x => {
      const result = makePlain(x)
      return {
        token: enc58('contract', result[0]),
        owner: enc58('identity', result[1]),
        is_buy: result[2].toLowerCase() === 'true' ? true : false,
        price: result[3],
        tez_amount: result[4],
        token_amount: result[5]
      }
    })
    
    const orders = {}
    order_lst.forEach(x => {
      if (x.token in TOKENS) {
        const key = TOKENS[x.token]
        if (!orders[key])
          orders[key] = {buying: [], selling: []}

        orders[key][x.is_buy ? 'buying' : 'selling'].push(x)
      }
    })

    DATA.orders = orders
    DATA.ready = true
    return DATA
  })
}

export function updateReward(pkh) {
  return tezbridge({method: 'pack_data', data: { "string": pkh }, type: { "prim": "address" }})
  .then(packed => {
    return tezbridge({method: 'hash_data', packed})
  })
  .then(hash_result => {
    const key = [[0,2], [2,4], [4,6], [6,8], [8,10], [10,undefined]].map(x => hash_result.slice(x[0], x[1])).join('/')

    return Promise.all([
        tezbridge({method: 'big_map_with_key', key, contract: getContract('token')}),
        tezbridge({method: 'big_map_with_key', key, contract: getContract('reward')}),
        tezbridge({method: 'head_custom', path: `/context/contracts/${getContract('reward')}/storage`})
      ])
  })
  .then(([token_amount, last_withdraw_date, storage]) => {
    token_amount = token_amount || {int: "0"}
    last_withdraw_date = last_withdraw_date || {int: "0"}

    token_amount = parseInt(token_amount.int)
    last_withdraw_date = last_withdraw_date.int * 1000

    const total = parseInt(storage.args[1].args[1].int)

    DATA.tes_reward_lst = storage.args[1].args[0].map(x => {
      const date = +new Date(x.args[1].string)
      return {
        tez_amount: parseInt(x.args[0].int * token_amount / total),
        date,
        available: date > last_withdraw_date
      }
    })

    console.log(DATA.tes_reward_lst)
  })
}
