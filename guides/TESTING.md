# Testing Guide

This guide provides instructions for testing the XCM Monitoring Service on both local and live networks.

## Testing With Local Network

### Setup Zombienet

We have a separate project repository [XCM Testing Tools](https://github.com/sodazone/xcm-testing-tools) to help ease the set up of a Zombienet ready for cross-chain asset transfers.

1. Clone the testing repo and navigate to its directory:

```
> git clone https://github.com/sodazone/xcm-testing-tools.git

> cd xcm-testing-tools/
```

2. Follow the instruction in the project README to set up Zombienet and assets.

### Set up XCM Monitoring Server

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

3. Set up the configuration file for your network in `<root>/config/`. Ensure that the parameters correspond to those used to set up Zombienet. If you are planning to test with light clients, copy the chain specs for your chains from the temp folder spawned by Zombienet into `<project-root>/chain-specs/`.

4. Run the XCM Monitoring Service

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

If you're running with light clients, you will need to wait until warp sync is finished before you start receiving new or finalized blocks.

### Add Subscriptions

Use the subscription API to subscribe to cross-chain messages.

Example subscribe to cross-chain messages from parachain 1000 to either relaychain or parachain 2000, sent from `//Alice` or `//Bob` account. In this case we set the notification type to `log` to see the notification in the console only:

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

Alternatively, you can use the Postman collection available in the `examples/` directory to interface with the subscription API.

### Make an Asset Transfer

Using the [scripts](https://github.com/sodazone/xcm-testing-tools#testing-asset-transfers) available in the `xcm-testing-tools` project, initiate a reserve-backed asset transfer using either Alice's or Bob's account.

A while after the extrinsic is finalized, you should receive similar logs in the console to indicate a notification:

```
[12:07:07 UTC] INFO: [2000:in] STORED hash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce:2000 (subId=asset-hub-transfers)
[12:07:07 UTC] INFO: [1000:out] MATCHED hash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce:2000
[12:07:07 UTC] INFO: [1000 ➜ 2000] NOTIFICATION subscription=asset-hub-transfers, messageHash=0x20ad5ddb54c87125bbaf7e90329db6e5ffd577478b96d85034d2826b91c65fce, outcome=Success (o: #217, d: #216)
```

You will notice that in the case of the example, the message on the destination chain was captured first and this is not a problem since the XCM Monitoring Service supports matching of messages out-of-order.

### Update the Notification Method

The subscription API allows you to update your notification method. In this example, we will update the notification from type `log` to type `webhook`.

Example JSON PATCH request:

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

Now if you make another transfer, the notification should be delivered to your endpoint with a message similar to the one below:

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

Similarly, the list of senders and destinations can be updated via the subscription API with a JSON PATCH request. The monitor will dynamically update the matching criteria to reflect these changes. For example, we can
remove Alice from, and add Ferdie to the list of senders to monitor with the following request:

```shell
curl --location --request PATCH 'http://127.0.0.1:3000/subs/asset-hub-transfers' \
--header 'Content-Type: application/json' \
--data '[
  { "op": "add", "path": "/senders/-", "value": "DE14BzQ1bDXWPKeLoAqdLAm1GpyAWaWF1knF74cEZeomTBM"},
  { "op": "remove", "path": "/senders/0"}
]'
```

Now, sending a transfer with Bob or Ferdie's account will result in a notification,  whereas sending a transfer with Alice's account will not trigger a notification.

## Testing With Live Network
