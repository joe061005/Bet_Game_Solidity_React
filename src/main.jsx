import { eth, Web3 } from 'web3';
import { useState, useEffect, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
    AppBar,
    Box,
    Button,
    CssBaseline,
    Dialog,
    GlobalStyles,
    IconButton,
    InputAdornment,
    LinearProgress,
    List,
    ListItem,
    ListItemIcon,
    MenuItem,
    Stack,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material';
import {
    Add,
    BorderAll,
    CurrencyExchange,
    Details,
    HistoryOutlined,
    Home,
    Info,
    InfoOutlined,
    NorthEast,
    Payment,
    Receipt,
    Send,
    SouthWest,
    TransferWithinAStation,
    Visibility,
    VisibilityOff
} from '@mui/icons-material';
import { create } from 'zustand';
import { DataGrid, GridToolbarContainer } from "@mui/x-data-grid";
import { BrowserRouter, createBrowserRouter, Link, Route, RouterProvider, Routes } from "react-router-dom";
import { enqueueSnackbar, SnackbarProvider } from "notistack";
import './style.css'
import abi from './abi'


const web3 = new Web3('ws://localhost:8546'); //local Geth node
await web3.eth.wallet.load('')
web3.eth.handleRevert = true

const contractAddress = '0x84Ee5Bee93b7ff40503c84878Df6Ff9152BCc0fb'

const contract = new web3.eth.Contract(abi, contractAddress)

const useWalletStore = create((set) => ({
    wallet: [...web3.eth.wallet], createAccount: async () => {
        const newAccount = web3.eth.accounts.create();
        web3.eth.wallet.add(newAccount);
        await web3.eth.wallet.save('');
        set({ wallet: [...web3.eth.wallet] });
    }
}))

const History = () => {
    const [history, setHistory] = useState([]);
    const [pending, setPending] = useState(false);

    const load = async () => {
        setPending(true);
        const lastBlockNumber = parseInt(history.at(-1)?.blockNumber ?? -1);
        const newHistory = [];
        for (let i = lastBlockNumber + 1; i <= await web3.eth.getBlockNumber(); i++) {
            const block = await web3.eth.getBlock(i);//traverse the blocks
            for (const txHash of block.transactions ?? []) {
                const tx = await web3.eth.getTransaction(txHash);//Obtain the transaction by hash
                const receipt = await web3.eth.getTransactionReceipt(txHash);
                newHistory.push({ ...tx, ...receipt, timestamp: block.timestamp })
                console.log(newHistory);
            }//obtain the transaction
        }
        setHistory((prevHistory) => [...prevHistory, ...newHistory]);//Put together the new history and the old ones
        setPending(false);
    }

    useEffect(() => {
        load()
    }, []);

    //Monitor the chain (creation of new block)
    useEffect(() => {
        let subscription;
        (async () => {
            subscription = await web3.eth.subscribe('newHeads');
            subscription.on('data', async (params) => {
                const block = await web3.eth.getBlock(params.number);
                const newHistory = [];
                for (const txHash of block.transactions ?? []) {
                    const tx = await web3.eth.getTransaction(txHash);
                    const receipt = await web3.eth.getTransactionReceipt(txHash);
                    newHistory.push({ ...tx, ...receipt, timestamp: block.timestamp })
                }
                setHistory((prevHistory) => {
                    const history = [...prevHistory];
                    for (const i of newHistory) {
                        if (history.length === 0 || i.blockNumber > history.at(-1).blockNumber) {
                            history.push(i);
                        }
                    }
                    return history;
                });
            });
        })();
        return () => {
            subscription?.unsubscribe();
        }
    }, []);

    const getMethodNameFromABI = (inputData) => {
        // Find the function based on the input data
        const functionSelector = inputData.slice(0, 10);
        for (let i = 0; i < abi.length; i++) {
            const functionAbi = abi[i];
            if (functionAbi.type != 'function') continue;
            const abiEncodedFunctionSignature = web3.eth.abi.encodeFunctionSignature(functionAbi);
            if (abiEncodedFunctionSignature === functionSelector) {
                return functionAbi.name;
            }
        }
        return "";
    }

    const decodeLog = (inputData) => {
        var log = ''
        abi.map((obj) => {
            if (obj.type == 'event' && obj.name == 'GameResult') {
                log = web3.eth.abi.decodeLog(obj.inputs, inputData.data, inputData.topics)['winner']
                return
            }
        })
        return log
    }

    return (
        <Box
            sx={{
                height: 1000, p: 2,
            }}>
            <DataGrid
                rows={history}
                loading={pending}
                columns={[{
                    field: 'transactionHash', headerName: 'Tx Hash', width: 400,
                }, {
                    field: 'from', headerName: 'From', width: 400
                }, {
                    field: 'to', headerName: 'To', width: 400
                }, {
                    field: 'value',
                    headerName: 'Value (ETH)',
                    width: 200,
                    valueGetter: ({ value }) => web3.utils.fromWei(value, 'ether')
                }, {
                    field: 'timestamp',
                    headerName: 'Time',
                    type: 'dateTime',
                    valueGetter: ({ value }) => new Date(parseInt(value) * 1000),
                    width: 300,
                }, {
                    field: 'input',
                    headerName: 'Method',
                    width: 200,
                    valueGetter: ({ value }) => value ? getMethodNameFromABI(value) : ''

                }, {
                    field: 'logs',
                    headerName: 'Log',
                    width: 200,
                    valueGetter: ({ value }) => (value.length > 0 ? decodeLog(value[0]) : '')

                }]}
                getRowId={(row) => row.transactionHash}
                disableRowSelectionOnClick
            />
        </Box>
    );
};

const Game = ({ me, setError, balance }) => {
    const [ranNum, setRanNum] = useState(0);
    const [hash, setHash] = useState(0);
    const [salt, setSalt] = useState('');
    const [stage, setStage] = useState(0);
    const [players, setPlayers] = useState([]);
    const [values, setValues] = useState([])
    const [deposit, setDeposit] = useState(0)
    const [winner, setWinner] = useState('')

    useEffect(() => {
        if(me && localStorage.getItem(`r${me.address}`)){
            setRanNum(localStorage.getItem(`r${me.address}`))
            setHash(localStorage.getItem(`h${me.address}`))
            setSalt(localStorage.getItem(`s${me.address}`))
        }else {
            generateRandomNumAndSalt();
        }
        updateStage();
    }, [me])


    useEffect(() => {
        let subscription;
        (async () => {
            subscription = await web3.eth.subscribe('newHeads');
            subscription.on('data', async (params) => {
                const block = await web3.eth.getBlock(params.number);
                for (const txHash of block.transactions ?? []) {
                    const tx = await web3.eth.getTransaction(txHash);
                    if (tx.to == contractAddress.toLocaleLowerCase()) {
                        await updateStage()
                    }
                }
            });
        })();
        return () => {
            subscription?.unsubscribe();
        }
    }, []);

    useEffect(() => {
        contract.events.GameResult({ fromBlock: 'latest' }).on('data', (event) => {
            const { returnValues } = event
            setValues([parseInt(returnValues['player1_value']), parseInt(returnValues['player2_value'])])
            setDeposit(web3.utils.fromWei(returnValues['deposit_amount'], 'ether'))
            setWinner(returnValues['winner'])
        })

    }, [])

    useEffect(() => {
        if (stage == 1 || stage == 2) {
            updatePlayer()
        } else if (stage == 5) {
            updateValue()
        }
    }, [stage])

    const generateRandomNumAndSalt =  () => {
        // generate a number bewteen 1 and 10000
        const num = Math.floor((Math.random() * 10000) + 1)
        const salt = generateRandomSalt()
        setRanNum(num)
        setHash(web3.utils.keccak256(num + salt))
        setSalt(salt)
        if(me){
           localStorage.setItem(`r${me.address}`, num)
           localStorage.setItem(`h${me.address}`, web3.utils.keccak256(num + salt))
           localStorage.setItem(`s${me.address}`, salt)
        }
    }

    const generateRandomSalt = () => {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let counter = 0;
        while (counter < 10) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
            counter += 1;
        }
        return result;
    }

    const updateStage = async () => {
        await contract.methods.get_stage().call().then((result) => {
            setStage(parseInt(result))
        }).catch((error) => {
            setError(error)
        })

    }

    const updatePlayer = async () => {
        await contract.methods.get_players().call().then((result) => {
            setPlayers(result)
        }).catch((error) => {
            setError(error)
        })
    }

    const updateValue = async () => {
        await contract.methods.get_values().call().then((result) => {
            setValues(result)
        }).catch((error) => {
            setError(error)
        })
    }

    const getStageString = () => {
        var str = ""
        switch (stage) {
            case 0:
                str = "Uninitialized"
                break;
            case 1:
                str = "Player 1 committed"
                break;
            case 2:
                str = "Player 2 committed"
                break;
            case 3:
                str = "Player 2 revealed"
                break;
            case 4:
                str = "Player 1 revealed"
                break;
            case 5:
                str = `Settled, ${winner} (player 1: ${values[0]}, player 2: ${values[1]}, total deposit: ${deposit})`
                break;
        }
        return str
    }

    const getPlayerString = () => {
        return players[1] == me.address ? "You are player 2" : "You are player 1"
    }

    const getNextStageString = () => {
        var str = ""
        switch (stage) {
            case 0:
                str = "Join the game via sending a commitment (Current: 0/2 players)"
                break;
            case 1:
                str = "Join the game via sending a commitment (Current: 1/2 players)"
                break;
            case 2:
                str = players[1] == me.address ? "Please reveal your value" : players[0] == me.address ? "Waiting for player 2 to reveal" : "Please wait until the game has ended"
                break;
            case 3:
                str = players[1] == me.address ? "Waiting for Player 1 to reveal" : players[0] == me.address ? "Please reveal your value" : "Please wait until the game has ended"
                break;
            case 4:
                str = "Waiting to settle"
                break;
            case 5:
                str = "Game over, click reset to play again"
                break;
        }
        return str
    }

    const commit = async () => {
        if(parseFloat(web3.utils.fromWei(balance, 'ether')) < 20){
            setError(`You do not have 20 ETH to join the game (Your Balance: ${parseFloat(web3.utils.fromWei(balance, 'ether'))} ETH)`)
            return
        }
        const encoded = contract.methods.set_commitment(hash).encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, value: web3.utils.toWei('20', 'ether'), data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e.reason)
        })

    }

    const refund = async () => {
        const encoded = contract.methods.refund().encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e.reason)
        })

    }

    const reveal = async () => {
        const encoded = contract.methods.reveal(ranNum, salt).encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e.reason)
        })
    }

    const settle = async () => {
        const encoded = contract.methods.settle().encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e.reason)
        })
    }

    const initGame = async () => {
        const encoded = contract.methods.init_game().encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e.reason)
        })
    }

    return (
        <>
            {
                me ?
                    <div className='Container'>
                        <div className="stageContainer">
                            Stage: {getStageString()}
                        </div>
                        {(stage != 0 && (players[0] == me.address || players[1] == me.address)) &&
                            <div className="playerContainer">
                                {getPlayerString()}
                            </div>
                        }
                        <div className="nextStageContainer">
                            Next: {getNextStageString()}
                        </div>
                        <TextField
                            label='Random chosen value'
                            value={ranNum}
                            className='RandomNumTextField'
                        />
                        <TextField
                            label='Random chosen value (Hash)'
                            value={hash}
                            className='RandomNumHashTextField'
                        />
                        <TextField
                            label='Salt'
                            value={salt}
                            className='SaltTextField'
                        />
                        <div className="btnContainer">
                            <Button
                                className='btn'
                                onClick={async () => { await commit() }}
                                sx={styles.btnStyle}
                            >
                                COMMIT
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => { await reveal(); }}
                                sx={styles.btnStyle}
                            >
                                REVEAL
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => { await settle(); }}
                                sx={styles.btnStyle}
                            >
                                SETTLE
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => {
                                    generateRandomNumAndSalt()
                                    if (stage == 5) {
                                        setPlayers([])
                                        setStage(0);
                                        setPlayers([]);
                                        await initGame();
                                    }
                                }}
                                sx={styles.btnStyle}
                                disabled={stage != 5 && stage != 0}
                            >
                                RESET
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => { await refund() }}
                                sx={styles.btnStyle}
                            >
                                REFUND
                            </Button>
                        </div>
                    </div >
                    :
                    <p className='loginReminderText'>
                        Please choose an account first
                    </p>
            }
        </>
    )
}

const Index = () => {
    const wallet = useWalletStore((state) => state.wallet);
    const createAccount = useWalletStore((state) => state.createAccount);// Create account
    const [currentAccount, setCurrentAccount] = useState();
    const [infoOpen, setInfoOpen] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const me = currentAccount === undefined ? undefined : wallet[currentAccount];
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [balance, setBalance] = useState(0);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState(0);

    useEffect(() => {
        if (currentAccount !== undefined && !pending) {
            web3.eth.getBalance(wallet[currentAccount].address).then(setBalance);
        }
    }, [currentAccount, pending]);

    useEffect(() => {
        if (error) {
            enqueueSnackbar(error, {
                variant: 'error'
            })
            setError('');
        }
    }, [error]);

    return <>
        {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, zIndex: 10000, width: '100%' }} />}
        <AppBar color='transparent' position='static'>
            <Toolbar>
                <IconButton color='primary' component={Link} to='/'>
                    <Home />
                </IconButton>
                <IconButton color='primary' component={Link} to='/history'>
                    <HistoryOutlined />
                </IconButton>
                <Box ml='auto'></Box>
                <TextField
                    sx={{
                        width: 500
                    }}
                    size='small'
                    select
                    label="Account"
                    value={currentAccount ?? ''}
                    onChange={e => {
                        setCurrentAccount(e.target.value);
                    }}
                >
                    {wallet.map((a, i) => <MenuItem key={i} value={i}>{a.address}</MenuItem>)}
                </TextField>
                <IconButton color='primary' onClick={() => {
                    createAccount();
                }}>
                    <Add />
                </IconButton>
                <IconButton color='primary' disabled={me === undefined} onClick={() => {
                    setInfoOpen(true);
                }}>
                    <InfoOutlined />
                </IconButton>
                <IconButton color='primary' disabled={me === undefined} onClick={() => {
                    setPaymentOpen(true);
                }}>
                    <Payment />
                </IconButton>
            </Toolbar>
        </AppBar>
        <Routes>
            <Route path='/history' element={<History />} />
            <Route path='/' element={<Game me={me} setError={setError} balance={balance} />} />
        </Routes>
        <Dialog open={infoOpen} onClose={() => setInfoOpen(false)}>
            <Stack gap={2} sx={{
                width: 500, margin: 2, display: 'flex', flexDirection: 'column',
            }}>
                <TextField
                    label='Balance'
                    value={web3.utils.fromWei(balance, 'ether')}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            ETH
                        </InputAdornment>
                    }}
                ></TextField>
                <TextField
                    label='Private Key'
                    type={showPrivateKey ? 'text' : 'password'} value={me?.privateKey}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            <IconButton
                                aria-label="toggle password visibility"
                                onClick={() => setShowPrivateKey((show) => !show)}
                                onMouseDown={(e) => e.preventDefault()}
                                edge="end"
                            >
                                {showPrivateKey ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                        </InputAdornment>
                    }}
                />
                <TextField
                    label='Address'
                    value={me?.address}
                />
            </Stack>
        </Dialog>
        <Dialog open={paymentOpen} onClose={() => {
            setPaymentOpen(false);
            setRecipientAddress('');
            setAmount(0);
        }}>
            <Stack gap={2} sx={{
                width: 500, margin: 2, display: 'flex', flexDirection: 'column',
            }}>
                <TextField
                    label='From'
                    value={me?.address}
                />
                <TextField
                    label='To'
                    value={recipientAddress}
                    onChange={(e) => {
                        setRecipientAddress(e.target.value);
                    }}
                />
                <TextField
                    label='Amount'
                    type='number'
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                    }}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            ETH
                        </InputAdornment>
                    }}
                />
                <p style={{ color: 'red' }}>
                    Your Balance: {parseFloat(web3.utils.fromWei(balance, 'ether'))}ETH
                </p>
                <Button onClick={async () => { //Transfer money
                    if (!web3.utils.isAddress(recipientAddress)) {
                        setError("Invalid recipient address!")
                        setRecipientAddress('')
                        return
                    } else if (recipientAddress == me.address) {
                        setError("You cannot transfer ETH to yourself!")
                        setRecipientAddress('')
                        return
                    }

                    if (amount > parseFloat(web3.utils.fromWei(balance, 'ether'))) {
                        setError("You don't have enough balance!")
                        setAmount(0)
                        return
                    } else if (amount <= 0) {
                        setError("The amount should be larger than 0!")
                        setAmount(0)
                        return
                    }
                    setPending(true);
                    try {
                        await web3.eth.sendSignedTransaction((await me.signTransaction({
                            to: recipientAddress, from: me.address, gas: 1000000, value: web3.utils.toWei(amount, 'ether'),
                        })).rawTransaction);
                        setPaymentOpen(false);
                        setRecipientAddress('');
                        setAmount(0);
                    } catch (e) {
                        setError(e.message);
                    }
                    setPending(false);
                }}>
                    Send
                </Button>
            </Stack>
        </Dialog>

    </>
}

const styles = {
    btnStyle: {
        borderRadius: 1,
        backgroundColor: '#357fd3',
        color: 'white',
        fontSize: 13,
        "&:hover": {
            backgroundColor: '#357fd3'
        }
    }
}

const App = () => {
    return <>
        <CssBaseline />
        <SnackbarProvider
            autoHideDuration={4000}
        />
        <BrowserRouter>
            <Index />
        </BrowserRouter>
    </>
}
createRoot(document.getElementById('root')).render(<App />);





