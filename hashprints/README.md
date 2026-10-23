# HashPrints (experimental)

3,333 pixel prints pressed from proof-of-work on Ethereum. You grind for a hash, the hash becomes the plate, and the more work you put in the less you pay.

**Status:** tested and internally reviewed (see [SECURITY.md](SECURITY.md)), **not deployed and not professionally audited**. The website runs the mint as a simulation.

Live site: https://hpsmine.vercel.app (the old address, hashprints.vercel.app, still works and serves the on-chain metadata) · X: [@hashprintsnft](https://x.com/hashprintsnft)

## Mint

| | |
|---|---|
| Supply | 3,333 = 10 runs × 333 public + 3 artist proofs (ids 1–3) |
| Price | flat 0.000315 ETH (≈ $0.80 at ETH ≈ $2,540, Oct 12 2026), gas paid by the minter |
| Limit | 2 public mints per wallet |
| Work | `keccak256(abi.encode(contract, wallet, nonce))` needs ≥ 16 leading zero bits, +1 bit every two runs (up to 20) |
| Rarity | +4 extra bits = Gold Leaf, +8 = Holo Foil. Extra bits never change the price. |
| Gas | ≈ 124k per mint |

The supply shape is a constructor argument, so the same contract also deploys **Test HashPrint** (10 tokens, 2 runs × 5, no artist proofs) for a small live run before the main mint.

## Layout

- `contracts/HashPrints.sol`: ERC-721 (OpenZeppelin 5) with the press built in.
- `site/hashprints.js`: shared core with keccak256, the hash search, collection configs and the print renderer. It mirrors the contract exactly.
- `site/index.html`, `site/app.js`, `site/grind-worker.js`: the website and simulator.
- `site/print.html`: single-print viewer, used as each token's `external_url`. Shows the owner, minter and history when the token is on chain.
- `site/collection.html`, `site/collection.js`, `site/api/collection.js`: the collection hub. Every minted print with trait filters and sorting, an activity feed, a holders list and a page per wallet (`collection.html?owner=0x…`). The API reads `Pressed` and `Transfer` logs from a public node, starting at `fromBlock` in `mint-config.json` (the deploy block), so there's no database to keep in sync.
- `site/mint.html`, `site/mint.js`: public mint page. Shows "Not live" and blocks minting until the owner presses Go live, then switches over by itself (checks every 15 s).
- `site/mint-config.json`: which contract the public mint page uses (`main` and `test`, with chain id and address), plus the WalletConnect project id.
- `site/wallet.js`: shared wallet connector (EIP-6963 wallet picker, WalletConnect, wallet-app links on phones, silent reconnect).
- `site/middleware.js`, `site/lib/admin-session.js`, `site/api/admin/`, `site/admin-login.html`: server-side wallet sign-in that gates the admin dashboard.
- `site/admin.html`, `site/admin.js`: owner dashboard. Connect a wallet to deploy, open minting, test-mint, withdraw, lock metadata and transfer ownership.
- `site/contract/`: compiled ABI + bytecode the admin page deploys, and the standard JSON input for Etherscan verification (`npm run export` regenerates both).
- `site/api/meta/[id].js`, `site/api/test/meta/[id].js`, `site/api/image.js`: stateless metadata and SVG endpoints (Vercel functions).
- `contracts/test/AttackMinter.sol`: test-only hostile minter for the re-entrancy tests.
- `test/HashPrints.test.js`: contract tests, which also check that the JS hash and price maths match the contract.

## Develop

```sh
npm install
npm test            # contract tests (~30 s)
npm run export      # rebuild site/contract/ after changing the contract
npm run serve       # website at http://localhost:8080
```

## Running a mint (admin page)

`/admin.html` is gated on the server (`site/middleware.js`). Without a session it redirects to `/admin-login.html`, where an admin wallet signs a free sign-in message. `api/admin/login.js` checks the signature, the domain and a 5-minute timestamp window, then sets a 12-hour HttpOnly session cookie. Two Vercel environment variables control it:

- `ADMIN_WALLETS`: comma-separated admin wallet addresses. Removing an address signs it out immediately.
- `ADMIN_SESSION_SECRET`: random key that signs session cookies. Rotating it signs everyone out.

If either is missing, nobody can sign in. The gate fails closed.

Once signed in, connect the wallet that should own the contract.

1. Pick a preset (Test HashPrint or HashPrints), check the fields, then click **Deploy**. The page sends an ordinary transaction to the public CREATE2 deployer (`0x4e59b44847b379578588920cA78FbF26c0B4956C`), which creates the contract with your wallet as owner. This works in wallets that can't send contract-creation transactions, such as Zerion. Your wallet sets the gas.
2. Verify the source on Etherscan using the values in the *Verify* panel.
3. Put the contract address and its deploy block (`fromBlock`) in `site/mint-config.json` (or share the public mint link the admin page shows). Without `fromBlock` the collection API looks the deploy block up on Blockscout.
4. **Go live**. Until then, the contract rejects every mint and the mint page shows "Not live". Going live can't be undone, and it locks the price.
5. **Find hash and mint** runs a real mint from your wallet. Check the token on a marketplace, then **Lock base URI**.
6. **Withdraw** sends the mint revenue (the contract balance) to any address. It defaults to the owner wallet.

Owner-only actions are enforced by the contract. The page itself holds no keys.

## Buying and selling

Prints are bought, sold and offered on directly from the site (print pages, the collection page and wallet pages). Trades settle on **Seaport 1.6** (`0x0000000000000068F116a894984e2DB1123eB395`, same address on Ethereum and Sepolia), the open exchange contract OpenSea also uses. There is no marketplace contract of our own and the site never holds anyone's money: every payment goes from buyer to seller (and to the fee wallets) inside one Seaport transaction.

| | How |
|---|---|
| List | Owner approves Seaport once (`setApprovalForAll`), then signs a fixed-price order for free. 1–180 days. |
| Change price | Cancels the old listing on chain, then signs the new one, so the old price can't be filled. |
| Buy | `fulfillOrder` on Seaport with the ETH. |
| Offer on a print | Buyer signs a WETH offer for free. The page wraps ETH into WETH and approves WETH for Seaport first if needed. |
| Collection offer | Same, for any print. Any owner can accept it with any of their prints. |
| Accept an offer | The owner sends one `matchAdvancedOrders` transaction: their own order (the print for the offer minus fees) matched against the buyer's signed offer. The owner is paid in WETH. |
| Cancel | `cancel` on Seaport for one order; "Cancel all" on your wallet page calls `incrementCounter`, which voids every order that wallet has signed. |
| Transfer | Send a print to another wallet from its page. |
| Unwrap | Turn WETH back into ETH from your wallet page. |

**Fees** (`market` in `site/mint-config.json`), taken out of the price, paid by Seaport in the same transaction:

- `creatorFeeBps: 800`: **8% creator fee** to `creatorFeeRecipient` (the admin wallet) on every listing and offer. The API refuses any order without exactly this fee.
- `marketFeeBps` / `marketFeeRecipient`: optional marketplace fee, off (0).
- Seaport charges nothing. Gas is paid by whoever sends a transaction (buyer, or the owner accepting an offer).

The 8% is enforced for trades made through this site. The HashPrints contract has no on-chain royalty enforcement (it can't be added after deployment), so other marketplaces decide their own creator fee; set it in each marketplace's collection settings.

**Checks.** `POST /api/market` stores an order only if it has exactly the site's shape and fees, the signer's Seaport counter matches, it isn't cancelled or filled, Seaport itself accepts the signature (read-only `validate`), and for listings the seller owns the print and has approved Seaport, for offers the buyer holds and has approved enough WETH. `GET` re-checks all of that every time: sold, cancelled, expired or moved orders are deleted; offers whose buyer is short of WETH are hidden until they're funded again. A wallet can have at most 25 open offers per collection.

**Storage.** Signed orders live in a Vercel Blob store (one JSON file per order). Create a **public** Blob store in the Vercel dashboard and connect it to the project; that adds `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN` on older stores). Without it the market is off and the pages hide the trading buttons.

Sales made anywhere through Seaport (including OpenSea, and accepted WETH offers) show up in Activity with their price and count toward volume.

`npm run test:market` (with `npx hardhat node` running) deploys real Seaport 1.6 code (`test/fixtures/seaport-1.6.json`, rebuilt by `scripts/build-seaport-fixture.js`) and a test WETH, then runs listing, buying, offers, collection offers, cancel, cancel-all, the fee payouts to the wei, and every order the API must refuse.

## WalletConnect

Paste a WalletConnect project id into `site/mint-config.json` (`walletConnectProjectId`) to add a WalletConnect option to the mint, sign-in and admin pages: a QR code on desktop, one tap on phones, and it works with almost any wallet app. Get the id free at [dashboard.reown.com](https://dashboard.reown.com) and add the site's domain to the project's allowed domains. With no id, the option is simply hidden.

`site/vendor/walletconnect.js` is a browser bundle of `@walletconnect/ethereum-provider`, rebuilt with `npm run build:walletconnect`. Pages only download it when someone picks WalletConnect.

## Metadata

`tokenURI(id)` returns `<baseURI><id>?seed=<on-chain seed>&d=<difficulty>`. With the base URI set to `https://hashprints.vercel.app/api/meta/`, the API renders the name, traits and an SVG image from the seed alone, with no chain reads and no database. Call `lockBaseURI()` once it's verified to freeze it for good.

Hardhat uses the solc-js compiler bundled in `node_modules` (see `hardhat.config.js`), so no compiler download is needed.
