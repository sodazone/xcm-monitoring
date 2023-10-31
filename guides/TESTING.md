# Testing Guide

This guide provides instructions for testing the XCM Monitoring Service on both local and live networks.

## Testing With Local Network

### Setup Zombienet

We have a separate project repository called [XCM Testing Tools](https://github.com/sodazone/xcm-testing-tools) to assist with setting up a Zombienet ready for cross-chain asset transfers.

1. Clone the testing repo and navigate to its directory:

```
> git clone https://github.com/sodazone/xcm-testing-tools.git

> cd xcm-testing-tools/
```

2. Follow the instruction in the project README to set up Zombienet and assets.

### Run XCM Monitoring Server

#### Running with NPM

1. In a separate terminal, clone the XCM Monitoring Server project.

```
> git clone https://github.com/sodazone/xcm-monitoring.git

> cd xcm-monitoring
```

2. Install and build the project

```
> npm install

> npm run build
```

3. Create the configuration file for your network in `<root>/config/`. Ensure that the parameters correspond to those used to set up Zombienet. If you are planning to test with light clients, copy the chain specs for your chains from the temporary folder spawned by Zombienet into `<project-root>/chain-specs/`.

> [!IMPORTANT]
> If any parachain is configured to use smoldot, the relay chain will also need to be configured with smoldot, as the smoldot client requires access to the relay chain to check for para-block inclusion and finality.

4. Run the server

```shell
npm run start -- -c ./config/<YOUR_CONFIG>.toml
```

#### Running with Docker

1. Download the Docker image.

```shell
TBD
```

2. Run.
3. 
```shell
TBD
```

> [!NOTE] 
> If you're using light clients, you will only start receiving new or finalized blocks when warp sync is finished.

### Add Subscriptions

Use the subscription API to subscribe to cross-chain messages.

Below is an example request to subscribe to cross-chain messages between parachain 1000 and either relay chain or parachain 2000, sent from `//Alice` or `//Bob` account. The notification type is set to `log` to view notifications in the console:

```shell
curl --location 'http://127.0.0.1:3000/subs' \
--header 'Content-Type: application/json' \
--data '[{
    "id": "asset-hub-transfers",
    "origin": 1000,
    "senders": ["HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F", "FoQJpPyadYccjavVdTWxpxU7rUEaYhfLCPwXgkfD6Zat9QP"],
    "destinations": [0, 2000],
    "notify": {
        "type": "log"
    }
}]'
```

### Make an Asset Transfer

Utilize the [scripts](https://github.com/sodazone/xcm-testing-tools#testing-asset-transfers) in the `xcm-testing-tools` project to initiate a reserve-backed asset transfer using either Alice's or Bob's account.

After the extrinsic is finalized, you will receive similar logs in the console to indicate a notification:

```
[12:07:07 UTC] INFO: [2000:in] STORED hash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce:2000 (subId=asset-hub-transfers)
[12:07:07 UTC] INFO: [1000:out] MATCHED hash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce:2000
[12:07:07 UTC] INFO: [1000 ➜ 2000] NOTIFICATION subscription=asset-hub-transfers, messageHash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce, outcome=Success (o: #217, d: #216)
```

In this example, the message on the destination chain was captured first. This is not a problem since the XCM Monitoring Service supports matching messages out-of-order.

> [!NOTE] 
> Connecting with light clients may result in a slightly longer wait for finalized blocks compared to RPC connections. Consequently, you might notice a short delay in notifications when using light clients.

### Update the Notification Method

The subscription API allows you to update your notification method. In this example, we will update the notification from type `log` to type `webhook`.

Example request:

```shell
curl --location --request PATCH 'http://127.0.0.1:3000/subs/asset-hub-transfers' \
--header 'Content-Type: application/json' \
--data '[
  { "op": "replace", "path": "/notify", "value": {
      "type": "webhook",
      "url": "https://webhook.site/faf64821-cb4d-41ad-bb81-fd119e80ad02"
  } }
]'
```

Now, if you make another transfer, the notification should be delivered to your endpoint with a message similar to the one below:

<details>
  <summary>JSON Notification</summary>

```json
{
  "subscriptionId":"asset-hub-transfers",
  "origin":{
    "chainId":1000,
    "blockNumber":"271",
    "blockHash":"0x2165b67e8ec89291633b6a10fab68a62b868cc69ab5ab2dd1e21372c4e5f3f62",
    "extrinsicId":"271-2",
    "event":{
      "eventId":"271-2-2",
      "extrinsicId":"271-2",
      "extrinsicPosition":2,
      "blockNumber":"271",
      "blockHash":"0x2165b67e8ec89291633b6a10fab68a62b868cc69ab5ab2dd1e21372c4e5f3f62",
      "method":"XcmpMessageSent",
      "section":"xcmpQueue",
      "index":"0x1e04",
      "data":{
        "messageHash":"0x825d998fc7f68a85777087d88d1e78951d25be433ac3240f5193884f949cf86a"
      }
    }
  },
  "destination":{
    "chainId":"2000",
    "blockNumber":"268",
    "blockHash":"0x0390ae32561ab87524fb5f0765604a519ca66a3aec64b8ca6c2ab81e455f2a03",
    "extrinsicId":"268-1",
    "event":{
      "eventId":"268-1-1",
      "extrinsicId":"268-1",
      "extrinsicPosition":1,
      "blockNumber":"268",
      "blockHash":"0x0390ae32561ab87524fb5f0765604a519ca66a3aec64b8ca6c2ab81e455f2a03",
      "method":"Success",
      "section":"xcmpQueue",
      "index":"0x3200",
      "data":{
        "messageHash":"0x825d998fc7f68a85777087d88d1e78951d25be433ac3240f5193884f949cf86a",
        "weight":{
          "refTime":"5,000,000,000",
          "proofSize":"327,680"
        }
      }
    }
  },
  "messageHash":"0x825d998fc7f68a85777087d88d1e78951d25be433ac3240f5193884f949cf86a",
  "messageData":"0x000314010400010300a10f043205011f0002286bee0a1300010300a10f043205011f0002286bee000d01020400010100d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d2cdde8ae7392d5e34e2aadd1976eb1540a18238f2f48bfde9058f3e1ec7c840899",
  "instructions":{
    "V3":[
      {
        "ReserveAssetDeposited":[
          {
            "id":{
              "Concrete":{
                "parents":"1",
                "interior":{
                  "X3":[
                    {
                      "Parachain":"1,000"
                    },
                    {
                      "PalletInstance":"50"
                    },
                    {
                      "GeneralIndex":"1,984"
                    }
                  ]
                }
              }
            },
            "fun":{
              "Fungible":"1,000,000,000"
            }
          }
        ]
      },
      "ClearOrigin",
      {
        "BuyExecution":{
          "fees":{
            "id":{
              "Concrete":{
                "parents":"1",
                "interior":{
                  "X3":[
                    {
                      "Parachain":"1,000"
                    },
                    {
                      "PalletInstance":"50"
                    },
                    {
                      "GeneralIndex":"1,984"
                    }
                  ]
                }
              }
            },
            "fun":{
              "Fungible":"1,000,000,000"
            }
          },
          "weightLimit":"Unlimited"
        }
      },
      {
        "DepositAsset":{
          "assets":{
            "Wild":{
              "AllCounted":"1"
            }
          },
          "beneficiary":{
            "parents":"0",
            "interior":{
              "X1":{
                "AccountId32":{
                  "network":null,
                  "id":"0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d"
                }
              }
            }
          }
        }
      },
      {
        "SetTopic":"0xdde8ae7392d5e34e2aadd1976eb1540a18238f2f48bfde9058f3e1ec7c840899"
      }
    ]
  },
  "outcome":"Success",
  "error":null
}
```
</details>

### Update Senders and Destinations

You can easily modify the list of senders and destinations through the subscription API using a JSON PATCH request. The monitor dynamically adjusts its matching criteria to incorporate these changes.

For instance, to add Ferdie and remove Alice from the list of senders being monitored, use the following request:

```shell
curl --location --request PATCH 'http://127.0.0.1:3000/subs/asset-hub-transfers' \
--header 'Content-Type: application/json' \
--data '[
  { "op": "add", "path": "/senders/-", "value": "DE14BzQ1bDXWPKeLoAqdLAm1GpyAWaWF1knF74cEZeomTBM"},
  { "op": "remove", "path": "/senders/0"}
]'
```

After making these changes, any cross-chain transfers from parachain 1000 initiated with Bob's or Ferdie's account will trigger a notification, while transfers from Alice's account will not prompt any notifications.

> [!NOTE]
> Check the API documentation for full suite of actions available on the subscription API

## Testing on Public Networks

Testing on public networks follows a process similar to the steps outlined above, with the exception of not having to spin up a Zombienet. Simply create a configuration file in `<project-root>/config/` for the set of chains you wish to monitor and run the server using the following command:

```shell
npm run start -- -c ./config/<YOUR_CONFIG>.toml
```

OR

```shell
docker ...
```

We provide a sample configuration file `<project-root>/config/polkadot.toml` for Polkadot and parachains (Asset Hub, Acala, Astar, Moonbeam) that you can use or modify according to your requirements.

Subscribe to cross-chain transfers as detailed in the section [Add Subscriptions](#add-subscriptions), and you will start receiving notifications when transfers occur.

> [!IMPORTANT]
> Connection to the network through light client only functions if there are bootnodes in the chain spec that listen on WebSocket.