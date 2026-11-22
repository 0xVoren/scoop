# Scoop 测试网全链路 + 边缘 E2E

[English](testnet-full-e2e.md)

**日期：** 2026-11-21  
**范围：** BSC testnet Diamond + Solana devnet program；全链路与边缘，非冒烟。  
**机密：** 私钥 / 助记词只在本机 env、1Password、Solana CLI；**禁止**写入本文件或 Agent Store。

---

## 总览

| 链 | 脚本 | 结果 |
|---|---|---|
| BSC testnet | `scripts/e2e-bsc-testnet.sh` | **PASSED**（含 ERC-20；全链路场景见下） |
| BSC testnet | `scripts/e2e-bsc-draw-too-early.sh` | **PASSED**（`DRAW_DELAY=32`，补跑原 delay=5 race） |
| Solana devnet | `scripts/e2e-solana-testnet-full.sh` | **PASSED**（含 SPL same-mint + late SlotHashes） |

部署地址见 [`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)。

### 场景对照

| 场景 | BSC | Solana |
|---|---|---|
| 多人买满 → delay → draw → claimPrize + claimProceeds（1% 费） | 通过 | 通过 |
| 超时未售罄 → refund + recoverPrize | 通过 | 通过 |
| 迟到熵过期 → draw 失败 → refund/recover | 通过（≥256 块） | 通过（SlotHashes 滚出） |
| 重复 claim/refund 应失败 | 通过 | 通过 |
| 未到 eligible 不能 draw | 通过（delay=32 补跑）* | 通过 |
| 份额边界（10+1 买满） | 通过 | 通过 |
| pending + drawMany | 通过 | 通过 |
| ERC-20 / SPL | ERC-20 通过 | SPL same-mint 通过；跨 mint 矩阵见本地 `e2e-solana-local` |

\* 原全链路脚本在 launch lock `drawDelayBlocks=5` 下曾因公共 RPC 确认延迟 race 跳过；已用 owner 临时 `allowCustomDrawDelay` + `DRAW_DELAY=32` 经 `scripts/e2e-bsc-draw-too-early.sh` 补跑通过，并恢复 launch config。

---

## 1. BSC testnet

- Diamond: `0xfB2678ff49967B073F6537781EC3d35DE731a5DF`
- Actors: `0xB04d2DA94991F5E6F0DE1aBE6EAC0f32fAc81aA4` / `0x0bbc8eA4B537Ff0D56bc827DD967A2A9a94fd553`
- feeRecipient: `0x1517821457C17b8e8019DA3C2cAFb5424855480b`（与 creator 不同 → 本轮用余额差校验 1% = `11000000000000` wei）

```bash
export PRIVATE_KEY=0x...   # funded tBNB；勿入库
export DIAMOND_ADDRESS=0xfB2678ff49967B073F6537781EC3d35DE731a5DF
export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
bash scripts/e2e-bsc-testnet.sh
# RESULTS_JSON=/tmp/scoop-bsc-e2e-results.json
```

### 0-draw-too-early

- **结果：** 通过（补跑；`DRAW_DELAY=32`）
- **备注：** oid=17 delay=32 head=143991806 elig=143991832；owner 临时解锁 `allowCustomDrawDelay` 后已恢复 launch config `(false,false,false,false,11,10,5)`
- **脚本：** `OWNER_PRIVATE_KEY=… DRAW_DELAY=32 bash scripts/e2e-bsc-draw-too-early.sh`
- **交易：**
  - unlock [`0x38d36ec6…`](https://testnet.bscscan.com/tx/0x38d36ec67dff6c20248f53f443ad2fdbe3da9191b85d1939ba54616120e05194)
  - create [`0x3bbc5d2a…`](https://testnet.bscscan.com/tx/0x3bbc5d2a6acb685cf09ee0e84d69c61c5a246e90f0c74f756a193c218970bb50)
  - sell-out [`0xc17f2ce6…`](https://testnet.bscscan.com/tx/0xc17f2ce6b857df4c6e52daedd44cc86e01aead89d950fa3135e79ec92cc1183b)
  - finish draw [`0x6288fb47…`](https://testnet.bscscan.com/tx/0x6288fb4757bfa01366cb6ed49d2a052c3ec9c68c756f56979f3ff42fcbcfdeaa)
- **历史：** 同日全链路首跑曾跳过（delay=5 race: head=143969705 elig=143969704；txs [`0xa98cc281…`](https://testnet.bscscan.com/tx/0xa98cc281f4cf840f836974d3e14d9ea283259c3eacb4ae664f0cc69ccc593ff3) / [`0x30e57e30…`](https://testnet.bscscan.com/tx/0x30e57e307f14529a131f7926463deb34bef164d64681ca1bcaebac21baa54639)）

### 1-multi-buy-draw-claim

- **结果：** 通过
- **备注：** oid=13 winner=0xB04d2DA94991F5E6F0DE1aBE6EAC0f32fAc81aA4 share=10 fee=11000000000000
- **交易：**
  - [`0x16883e52…`](https://testnet.bscscan.com/tx/0x16883e520a20790ab3b1d980996085e9ffead4dd02d0d36408a53c260f785bdc)
  - [`0xd86a6007…`](https://testnet.bscscan.com/tx/0xd86a60073ec826b2925fb05c4a382adb1a93b430befa6e92d465316f1ca02b4f)
  - [`0x02bcb870…`](https://testnet.bscscan.com/tx/0x02bcb870d9b3b36ca2885e94b14f49eb163cf272452a58e80939ff828f2efc2a)
  - [`0x400b10c1…`](https://testnet.bscscan.com/tx/0x400b10c15a921738d4c80d4181f64b92d1ba615e51edcb54328f870161a15fac)
  - [`0x0ae39da9…`](https://testnet.bscscan.com/tx/0x0ae39da9abf6d57c53c17fdab26ad9f06ccda0564aa62ddf4289573e99dacc7f)
  - [`0x6a57a2d4…`](https://testnet.bscscan.com/tx/0x6a57a2d471df1ab7a7112185581272d00cf629ad27051772ea767b3627b395af)

### 4-drawMany-pending

- **结果：** 通过
- **备注：** oid=14 pending_before=4
- **交易：**
  - [`0xcdb648b1…`](https://testnet.bscscan.com/tx/0xcdb648b16cdf850f12d79495efd17461e79df364a141e7b5b10dfc5ac35ff5d0)
  - [`0x300e0459…`](https://testnet.bscscan.com/tx/0x300e0459f4b846119b5417af69d8aaf48953822838d49422ceedd3bcf0d0214a)
  - [`0x4535a0aa…`](https://testnet.bscscan.com/tx/0x4535a0aa7a2989873da98b9c06e97c7233de172eb655d7a490a68aaa70f1dd9f)

### 5-erc20-lifecycle

- **结果：** 通过
- **备注：** oid=15 token=0x1cafbf86800ca5fb993f028c5b8ba53d286eb137
- **交易：**
  - [`0x38051a92…`](https://testnet.bscscan.com/tx/0x38051a926a14a3319d898f4ea23fd735f2524449a70afc88da3d6ef62b87dfe8)
  - [`0x2f769fdf…`](https://testnet.bscscan.com/tx/0x2f769fdf1296ff63377343a05b2e7785d73d819ecb0a43098803c91f349a3964)
  - [`0xa50414f5…`](https://testnet.bscscan.com/tx/0xa50414f5a74d5dd17f7a1762c1609e62d2ba37fed691ddda12ad6b0796a601c9)
  - [`0x9d4df099…`](https://testnet.bscscan.com/tx/0x9d4df0993b5db9e99ba36070377b6d01b93946985f494c95335ef11021df54c6)
  - [`0xb232bfa3…`](https://testnet.bscscan.com/tx/0xb232bfa3d1a2cf7af5cf8e6dfc090884171fa0f068b216ff9888149452db47dc)
  - [`0x46bf411c…`](https://testnet.bscscan.com/tx/0x46bf411cb77b3790fd69d7d0443b4adbd03672d7bfa4ca0f8db34d1dff1a00c4)

### 2-expire-refund-recover

- **结果：** 通过
- **备注：** oid=11
- **交易：**
  - [`0x7fc400dc…`](https://testnet.bscscan.com/tx/0x7fc400dcdc765880b01e6e8a3598dad114ccf463908644a75c130a5ad5e83129)
  - [`0xe0b84207…`](https://testnet.bscscan.com/tx/0xe0b8420766a1d525005f8464c7f6aa38d0ea9a196a9a3e7ebb380004ac216df3)
  - [`0x7302bd9e…`](https://testnet.bscscan.com/tx/0x7302bd9ee3a43fbf7324af1571aee315c79e469fef1cdde5f796bdcb0ab94c9f)
  - [`0x30fb05c6…`](https://testnet.bscscan.com/tx/0x30fb05c67903bfb42b37ff169969cd2d5f8dd24536e9707fec6b6784fc32a046)

### 3-late-entropy

- **结果：** 通过
- **备注：** oid=10 elig=143969673
- **交易：**
  - [`0xcad330db…`](https://testnet.bscscan.com/tx/0xcad330db5090e90f60171db38f6b10d17987307566d4091e8b9c168eeb92bced)
  - [`0x17848b50…`](https://testnet.bscscan.com/tx/0x17848b50ac4721831eba912a9508fac5211361a59a15283eff91cd478951c3bf)
  - [`0x286699c0…`](https://testnet.bscscan.com/tx/0x286699c00802e7a9a32c4b5a32c959b24c8c2955ec2513f0759a8b23c44f7faa)
  - [`0x1ed967f0…`](https://testnet.bscscan.com/tx/0x1ed967f07fa7b3fe338bbf2c16a13a8bebb6feb683a364331e896b7bca378152)

---

## 2. Solana devnet

- Program: `FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT`
- Authority: `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH`
- fee_recipient: `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH`

```bash
export SOLANA_AUTHORITY_KEYPAIR=~/.config/solana/id.json
export SOLANA_PROGRAM_ID=FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT
bash scripts/e2e-solana-testnet-full.sh
# RESULTS_JSON=/tmp/scoop-solana-e2e-results.json
```

注意：late raffle 必须在 `draw_many` **之后**创建，否则 keeper/tick 会把尚在 pending 的 SoldOut 一并抽掉。

### 1-multi-buy-draw-claim

- **结果：** 通过
- **备注：** rid=11 winner=G1zikfcHYRy94kNc6wYpBqKMy2FaNhf8gTiJuWsEzkjF share=7 fee=1%
- **交易：**
  - [`KgEaeAbFts…`](https://explorer.solana.com/tx/KgEaeAbFtskgPFPgh4mMEEtmR55e5Fd6dSAuaP4A1bAjoBL1WW47B33zkcALej69JKNpdZwwr6h1ddTjYSn6FYM?cluster=devnet)
  - [`449QNyXxA2…`](https://explorer.solana.com/tx/449QNyXxA2vEzLVPSd28zQg3F4HHppgGB21UBWkV8D54Wtea8c8rkYWi6z8U2ZVHYqVUfXKrdnfkF7kMZzsLQ2jR?cluster=devnet)
  - [`2en9hbw2y5…`](https://explorer.solana.com/tx/2en9hbw2y58yJVL2W9xz3YwtupCoba3LhwXiJDaRe7jxtsd6uysBQYKpAMV5wqzjVPyMxfhk4cP4F4mAg4uUeFNM?cluster=devnet)
  - [`3i9kRL8vrU…`](https://explorer.solana.com/tx/3i9kRL8vrUF5vb4hTH7LPHCsg3GWX2tvqNexyymKkFnbqJgJNGcvQrvXvc3LfVeLBapUYd42RGqE8TFmznxTBAGD?cluster=devnet)
  - [`51aFgj28US…`](https://explorer.solana.com/tx/51aFgj28USANHPnMan83d9RBJEhx1w52beP7BsWx11exJbWSGU4knRXVcpHrf2JXFR4tzrFSJsGU5wpVRfqgQf65?cluster=devnet)
  - [`4shmGPf5w1…`](https://explorer.solana.com/tx/4shmGPf5w1mMAZASD8Apmrs8aenYgCHb9ECX9vKwdaFY8M4dv5jGPsjaL43pVqdaThksj7Wq3P2VokKW6ti5ibMj?cluster=devnet)

### 4-drawMany-pending

- **结果：** 通过
- **备注：** rid=12 pending_ready=12
- **交易：**
  - [`Xd9yLTuwe3…`](https://explorer.solana.com/tx/Xd9yLTuwe3LTkWBRfGUuXcRNpq4Ah65JaNnJE7oFE1PdAScPJ8dhVy5ne3DDQjLBq4skU3NAZYryw1dJY2n9asZ?cluster=devnet)
  - [`2rrUVmcnoa…`](https://explorer.solana.com/tx/2rrUVmcnoazJ36TUikrFjhYRbFz6KGuRBRg5zmPpnRTfE8QMvjyFExVTTX3pZd2pzm1EPBG1Doby8gcDgmqbCcMy?cluster=devnet)
  - [`3RC6qiCHyA…`](https://explorer.solana.com/tx/3RC6qiCHyAXXkBt5D8E5ZTzcNkkvvpHSLoBWZxFfjgRynB1yEJWiphYD6D9AR66SqchYug57t1J1FZxRjTj1j3Br?cluster=devnet)

### 5-spl-same-mint

- **结果：** 通过
- **备注：** rid=13 mint=8toowVVgRJq8S1YEovFMNy3Ggmhs4nsEL2qLqAzsudhx
- **交易：**
  - [`zPccB2o7Wi…`](https://explorer.solana.com/tx/zPccB2o7WibEakPMYPMJbn3TP9aLrpywaLhdW5LGHSuWwWEqjJYK6mW5de18c1gn5ctwuoHrDHGbh3cFWJ3zvWK?cluster=devnet)
  - [`F88bAopSVz…`](https://explorer.solana.com/tx/F88bAopSVzLHJXgbxHgJKYPM2hDQ2Sq5MP554wm1n5BJkR1eHLrqAbNv4gPyB7fvUnT7UHxSwjfiDhu3BnmX4ei?cluster=devnet)
  - [`256bJG7AB2…`](https://explorer.solana.com/tx/256bJG7AB29PkUtGaCJ4749MyoaVrea2sm7h2mtHNWgk5AHvTTvtLyWARN4DB5xDm8Vy4bbMExMiPJfNbwWfnMPt?cluster=devnet)
  - [`4JNw8dBQj7…`](https://explorer.solana.com/tx/4JNw8dBQj7ZM8AFQHU6gthoAupaDao5m5smmxEWUojrhSDTNjjPtgk8oVHYTZW5o4uGqh8rYEgAeHA4KWiRorMJL?cluster=devnet)
  - [`2tD8eZbWsv…`](https://explorer.solana.com/tx/2tD8eZbWsvgyX5KDRdTKvgLcjTM2hfcAPFeYJ2XV19rztTvBdhBDk9Y8r76TQ5MQUeU83zPBVwciFF8mfb4eJKEw?cluster=devnet)
  - [`f1VQy6BL23…`](https://explorer.solana.com/tx/f1VQy6BL23ee4HMNa42dt1Ebbk1BVowUaS1e6jMD42sPJFjqg92w2FetoxEnAJhREF2ZhN5ryHVtH34jzssLaN4?cluster=devnet)

### 2-expire-refund-recover

- **结果：** 通过
- **备注：** rid=10
- **交易：**
  - [`5gdNRXa34c…`](https://explorer.solana.com/tx/5gdNRXa34cxXnfhVdiLf56engzXbby4mHpu4sHqj3eTLyWbx57BCb63xdJcEbZL6GPKYg6kGHEZwyCdS6wgk3eR5?cluster=devnet)
  - [`3pPyapC3uh…`](https://explorer.solana.com/tx/3pPyapC3uh5cGZNC2i6sZT5yaViZTHrncoAaS63kLB44GuJMvMnxV4KFkpE2Kwf4QBH1oQUWXkmVmAY4ca6tU2jH?cluster=devnet)
  - [`zLvo2FiLgA…`](https://explorer.solana.com/tx/zLvo2FiLgAXx9bt6wUB5mTCFsLyHGRMBjG4BuPDxhzK1gJQ93WX7GCGmjgpuHZTYBPFP5dfHNo2HWsGe6r4xonu?cluster=devnet)
  - [`3iECwoJCJp…`](https://explorer.solana.com/tx/3iECwoJCJpQDZupUhxQrTtkv3fZg8rFLc2FDdPfQE4wTQ3mnZDhiVuKyhc7r9fZyMFDaDkpZX655F8UuZDKK7Hc?cluster=devnet)

### 3-late-entropy

- **结果：** 通过
- **备注：** rid=14 elig=524614709
- **交易：**
  - [`53ooudF2G7…`](https://explorer.solana.com/tx/53ooudF2G7rrVgtj3Kj8pDwG5HYenYMNANwqFCMzDJD6hLaMbMEncMoFZCjDfkPUgv5xskKew4cyVsaYNkchQPD7?cluster=devnet)
  - [`2oQUD9u3TZ…`](https://explorer.solana.com/tx/2oQUD9u3TZ25hZyDJZgh36qKFRqzjiEoBFnDizMuFVfBLFZPqRNnzk1ioyyaK2xKkB1zGAEqnixw9EHzKqGuh29y?cluster=devnet)
  - [`5Eo6ah9wb5…`](https://explorer.solana.com/tx/5Eo6ah9wb5oXCPFHKesHjos7Lpc7ET4wtdPoyfyDHTSt5AhvQhsfRhHuCqkARFgxDyjvg6FVNRiE6nxguAGqgLoy?cluster=devnet)
  - [`7hs2TTeKjm…`](https://explorer.solana.com/tx/7hs2TTeKjmWHPwr2TqeCnabF4kj59PpD5Ji51WiqaR8AKV3WHMnhfbKy4otZ7CSe1ci6XZV3iWsgQWTFisGk3CQ?cluster=devnet)

---

## 余额 / 缺口

| 链 | 地址 | 本轮后约余 | 备注 |
|---|---|---|---|
| BSC | `0xB04d2DA94991F5E6F0DE1aBE6EAC0f32fAc81aA4` | ~0.619 tBNB | 足够完成本轮；中断残留 oid 5/6 因 ephemeral buyer 未落盘无法退款（新建单已覆盖） |
| Solana | `KKjheWGV6VH12Jy8KTjyY4yeHHJAeyGYfkyKrkzD8bH` | ~1.9→更低 SOL | prize=0.02 SOL/单；全量约需 ≥0.5 SOL 缓冲 |

无余额缺口阻塞本轮交付。

---

## 关联

- 部署记录：[`testnet-contracts-deploy.md`](testnet-contracts-deploy.md)
- 本地全链路：`scripts/e2e-local.sh` · `scripts/e2e-solana-local.sh`
- 测试网脚本：`scripts/e2e-bsc-testnet.sh` · `scripts/e2e-bsc-draw-too-early.sh` · `scripts/e2e-solana-testnet-full.sh`
