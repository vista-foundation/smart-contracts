// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {type Script} from "@blaze-cardano/core";
import {applyParamsToScript, cborToScript} from "@blaze-cardano/uplc";
import {type PlutusData} from "@blaze-cardano/core";

export interface PermissionedMintMint {
    new(permissionedCredential: {
        Inline: [{ VerificationKeyCredential: [string] } | {
            ScriptCredential: [string]
        }]
    } | {
        Pointer: {
            slotNumber: bigint,
            transactionIndex: bigint,
            certificateIndex: bigint
        }
    }): Script;

    rdmr: "Minting" | "Burning";
};

export const PermissionedMintMint = Object.assign(
    function (permissionedCredential: {
        Inline: [{ VerificationKeyCredential: [string] } | {
            ScriptCredential: [string]
        }]
    } | {
        Pointer: {
            slotNumber: bigint,
            transactionIndex: bigint,
            certificateIndex: bigint
        }
    }) {
        return cborToScript(applyParamsToScript("5902c2010000323232323232323222253233300530013006375400426464a66600e64646464646464a66601c6014601e6ea80184c94ccc03cc02cc040dd50050992999808180618089baa00f1325333011300d30123754002264646600200200c44a66602e00229404c94ccc054cdc79bae301a00200414a226600600600260340026eb8c058c04cdd5000801180a98091baa00f0011323300100100422533301400114a0264a66602466ebc044c04cc05c008528899801801800980b8008991919299980919b8748008c04cdd50008a5113233001001300337566030602a6ea8008894ccc05c004528899299980a99b88375a603400490000998018018008a50301a001323300100100822533301600114c0103d87a80001323232325333017337220120042a66602e66e3c0240084cdd2a4000660366e980052f5c02980103d87a8000133006006003375660300066eb8c058008c068008c060004c004004894ccc05000452f5c026602a6026602c00266004004602e0026eb8c04cc040dd50030b1bac30123013301300237566022002602260220046eacc03c004c03cc03cc03cc03cc02cdd518070011806980700098049baa00414984d958c94ccc01cc00c00454ccc028c024dd50010a4c2c2a66600e66e1d20020011533300a300937540042930b0b18039baa001533333300c0031003161616161322533300732332232533300b3007300c3754014264a6660186010601a6ea80044c8c8cc004004014894ccc048004528099299980819b8f375c602a00400829444cc00c00c004c054004dd7180898071baa0010023010300d37540140022646600200200644a66601e00229404c94ccc034cdd7806180718090010a5113300300300130120013756601a0026eb0c034c038c038004c034c034c034c034c034c034c024dd5180618049baa00114984d958c028c01cdd50011b87480015cd2ab9d5573caae7d5d02ba15744ae91", [permissionedCredential], {
            "dataType": "list", "items": [{
                "title": "Referenced",
                "description": "Represent a type of object that can be represented either inline (by hash)\n or via a reference (i.e. a pointer to an on-chain location).\n\n This is mainly use for capturing pointers to a stake credential\n registration certificate in the case of so-called pointer addresses.",
                "anyOf": [{
                    "title": "Inline",
                    "dataType": "constructor",
                    "index": 0,
                    "fields": [{
                        "description": "A general structure for representing an on-chain `Credential`.\n\n Credentials are always one of two kinds: a direct public/private key\n pair, or a script (native or Plutus).",
                        "anyOf": [{
                            "title": "VerificationKeyCredential",
                            "dataType": "constructor",
                            "index": 0,
                            "fields": [{"dataType": "bytes"}]
                        }, {
                            "title": "ScriptCredential",
                            "dataType": "constructor",
                            "index": 1,
                            "fields": [{"dataType": "bytes"}]
                        }]
                    }]
                }, {
                    "title": "Pointer",
                    "dataType": "constructor",
                    "index": 1,
                    "fields": [{
                        "dataType": "integer",
                        "title": "slotNumber"
                    }, {
                        "dataType": "integer",
                        "title": "transactionIndex"
                    }, {"dataType": "integer", "title": "certificateIndex"}]
                }]
            }]
        } as any), "PlutusV2");
    },

    {
        rdmr: {
            "title": "MintRedeemer",
            "anyOf": [{
                "title": "Minting",
                "dataType": "constructor",
                "index": 0,
                "fields": []
            }, {
                "title": "Burning",
                "dataType": "constructor",
                "index": 1,
                "fields": []
            }]
        }
    },
) as unknown as PermissionedMintMint;

export interface PermissionedMintUpdate {
    new(permissionedCredential: {
        Inline: [{ VerificationKeyCredential: [string] } | {
            ScriptCredential: [string]
        }]
    } | {
        Pointer: {
            slotNumber: bigint,
            transactionIndex: bigint,
            certificateIndex: bigint
        }
    }): Script;

    _datum: PlutusData;
    _rdmr: { wrapper: PlutusData };
};

export const PermissionedMintUpdate = Object.assign(
    function (permissionedCredential: {
        Inline: [{ VerificationKeyCredential: [string] } | {
            ScriptCredential: [string]
        }]
    } | {
        Pointer: {
            slotNumber: bigint,
            transactionIndex: bigint,
            certificateIndex: bigint
        }
    }) {
        return cborToScript(applyParamsToScript("5902c2010000323232323232323222253233300530013006375400426464a66600e64646464646464a66601c6014601e6ea80184c94ccc03cc02cc040dd50050992999808180618089baa00f1325333011300d30123754002264646600200200c44a66602e00229404c94ccc054cdc79bae301a00200414a226600600600260340026eb8c058c04cdd5000801180a98091baa00f0011323300100100422533301400114a0264a66602466ebc044c04cc05c008528899801801800980b8008991919299980919b8748008c04cdd50008a5113233001001300337566030602a6ea8008894ccc05c004528899299980a99b88375a603400490000998018018008a50301a001323300100100822533301600114c0103d87a80001323232325333017337220120042a66602e66e3c0240084cdd2a4000660366e980052f5c02980103d87a8000133006006003375660300066eb8c058008c068008c060004c004004894ccc05000452f5c026602a6026602c00266004004602e0026eb8c04cc040dd50030b1bac30123013301300237566022002602260220046eacc03c004c03cc03cc03cc03cc02cdd518070011806980700098049baa00414984d958c94ccc01cc00c00454ccc028c024dd50010a4c2c2a66600e66e1d20020011533300a300937540042930b0b18039baa001533333300c0031003161616161322533300732332232533300b3007300c3754014264a6660186010601a6ea80044c8c8cc004004014894ccc048004528099299980819b8f375c602a00400829444cc00c00c004c054004dd7180898071baa0010023010300d37540140022646600200200644a66601e00229404c94ccc034cdd7806180718090010a5113300300300130120013756601a0026eb0c034c038c038004c034c034c034c034c034c034c024dd5180618049baa00114984d958c028c01cdd50011b87480015cd2ab9d5573caae7d5d02ba15744ae91", [permissionedCredential], {
            "dataType": "list", "items": [{
                "title": "Referenced",
                "description": "Represent a type of object that can be represented either inline (by hash)\n or via a reference (i.e. a pointer to an on-chain location).\n\n This is mainly use for capturing pointers to a stake credential\n registration certificate in the case of so-called pointer addresses.",
                "anyOf": [{
                    "title": "Inline",
                    "dataType": "constructor",
                    "index": 0,
                    "fields": [{
                        "description": "A general structure for representing an on-chain `Credential`.\n\n Credentials are always one of two kinds: a direct public/private key\n pair, or a script (native or Plutus).",
                        "anyOf": [{
                            "title": "VerificationKeyCredential",
                            "dataType": "constructor",
                            "index": 0,
                            "fields": [{"dataType": "bytes"}]
                        }, {
                            "title": "ScriptCredential",
                            "dataType": "constructor",
                            "index": 1,
                            "fields": [{"dataType": "bytes"}]
                        }]
                    }]
                }, {
                    "title": "Pointer",
                    "dataType": "constructor",
                    "index": 1,
                    "fields": [{
                        "dataType": "integer",
                        "title": "slotNumber"
                    }, {
                        "dataType": "integer",
                        "title": "transactionIndex"
                    }, {"dataType": "integer", "title": "certificateIndex"}]
                }]
            }]
        } as any), "PlutusV2");
    },
    {_datum: {"title": "Data", "description": "Any Plutus data."}},
    {
        _rdmr: {
            "title": "Wrapped Redeemer",
            "description": "A redeemer wrapped in an extra constructor to make multi-validator detection possible on-chain.",
            "anyOf": [{
                "dataType": "constructor",
                "index": 1,
                "fields": [{"description": "Any Plutus data."}]
            }]
        }
    },
) as unknown as PermissionedMintUpdate;