// SPDX-License-Identifier: MIT
pragma solidity ^0.8;
// import library for converting uint256 to string
import "@openzeppelin/contracts/utils/Strings.sol";

contract Bank {
    address payable owner;    // banker address
    address payable[2] players;  // player addresses
    uint256 stage; // game stage
    bytes32[2] hashes; // hash values of the random numbers picked by the players
    uint256[2] values; // random numbers picked by the players
    uint256[2] deposits; // amount of ETH deposited by the players

    // only banker can call specific function
    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner");
        _;
    }

    // only players can call specific function
    modifier onlyPlayer() {
        require(
            msg.sender == players[0] || msg.sender == players[1],
            "You must be one of the players"
        );
        _;
    }

    // only players or owner can call specific function
    modifier onlyPlayerOrOwner() {
        require(
            msg.sender == players[0] ||
                msg.sender == players[1] ||
                msg.sender == owner,
            "You must be one of the players or owner"
        );
        _;
    }

    // event for announcing the game result
    event GameResult(
        uint256 player1_value,
        uint256 player2_value,
        uint256 deposit_amount,
        string winner
    );


    constructor() {
        // please change this to the address of the banker
        owner = payable(address(0xc267E4A288AF6d23c358F65CD987B252D7057E89));
        // game stage = uninitialized
        stage = 0;
        // no players in the game
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }

    // only banker can call this function
    // refund 98% of the deposits if the player does not reveal for a long time
    // 2% for transaction fee
    function refundForOwner() public onlyOwner {
        // if player 2 does not reveal for a long time, refund and restart the game
        if (stage == 2) {
            // refund 98% of deposits to player 2
            (bool success1, ) = players[1].call{
                value: (deposits[1] / 100) * 98
            }("");
            require(success1);
            // refund all deposits to player 1
            (bool success2, ) = players[0].call{value: deposits[0]}("");
            require(success2);
        // if player 1 does not reveal for a long time, refund and restart the game
        } else if (stage == 3) {
            // refund 98% of deposits to player 1
            (bool success1, ) = players[0].call{
                value: (deposits[0] / 100) * 98
            }("");
            require(success1);
            // refund all deposits to player 2
            (bool success2, ) = players[1].call{value: deposits[1]}("");
            require(success2);
        }
        stage = 5;
        init_game();
    }

    // only players can call this function
    // refund 98% of the deposits if the player wants to refund
    // 2% for transaction fee
    function refund() public onlyPlayer {
        // if player 1 wants to refund (similar to refundForOwner())
        if (msg.sender == players[0]) {
            (bool success1, ) = players[0].call{
                value: (deposits[0] / 100) * 98
            }("");
            require(success1);
            if (players[1] != address(0)){
                (bool success2, ) = players[1].call{value: deposits[1]}("");
                require(success2);
            }

        // if player 2 wants to refund (similar to refundForOwner())
        } else {
            (bool success1, ) = players[1].call{
                value: (deposits[1] / 100) * 98
            }("");
            require(success1);
            (bool success2, ) = players[0].call{value: deposits[0]}("");
            require(success2);
        }
        stage = 5;
        init_game();
    }


    // get the stage number
    function get_stage() public view returns (uint256) {
        return stage;
    }

    // get the player addresses
    function get_players() public view returns (address, address) {
        return (players[0], players[1]);
    }

    // get the random numbers picked by the players
    function get_values() public view returns (uint256, uint256) {
        return (values[0], values[1]);
    }

    // get the hash values
    function get_hashValues() public view returns (bytes32, bytes32) {
        return (hashes[0], hashes[1]);
    }


    // initialize the game
    function init_game() public {
        // only when the game has ended or the banker calls this function
        require(
            stage == 5 || msg.sender == owner,
            "Please wait until the game has ended"
        );
        // game stage = uninitialized
        stage = 0;
        // no players in the game
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }

    // one can join the game by sending the hash value formed by random number and salt
    function set_commitment(bytes32 commitment) public payable {
        // make sure that there are only two players in the game
        require(
            stage == 0 || stage == 1,
            "Please wait until the game has ended"
        );
        // make sure that the player deposits 20 ETH
        require(msg.value == 20 ether, "You need to deposit 20 ETH");
        // make sure that the current player cannot join the game
        require(
            msg.sender != players[0] && msg.sender != players[1],
            "You have joined the game"
        );
        // player 1 sets commitment
        if (stage == 0) {
            players[0] = payable(msg.sender);
            hashes[0] = commitment;
            deposits[0] = msg.value;
        // player 2 sets commitment
        } else {
            players[1] = payable(msg.sender);
            hashes[1] = commitment;
            deposits[1] = msg.value;
        }
        stage += 1;
    }

    // only players can call this function
    // send number and salt for verification
    function reveal(uint256 _value, string calldata salt) public onlyPlayer {
        if (msg.sender == players[0]) {
            // player 1 should reveal after player 2
            require(stage == 3, "It is not the time for player 1 to reveal");
            // check if the hash value is the same
            require(
                hashes[0] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), salt)
                        )
                    ),
                "Invalid value and salt"
            );
            // reveal the number
            values[0] = _value;
        } else {
            // player 2 should reveal first
            require(stage == 2, "It is not the time for player 2 to reveal");
            // check if the hash value is the same
            require(
                hashes[1] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), salt)
                        )
                    ),
                "Invalid value and salt"
            );
            // reveal the number
            values[1] = _value;
        }
        stage += 1;
    }

    // only banker or players can call this function
    // game result announcement and deposit settlement
    function settle() public onlyPlayerOrOwner {
        // make sure that two players have revealed their numbers
        require(stage == 4, "It is not the time to settle");
        // send 5% of the deposits to banker
        (bool success1, ) = owner.call{
            value: ((deposits[0] + deposits[1]) / 100) * 5
        }("");
        require(success1);

        // if the sum of the random numbers is an even number, player 1 wins
        if (((values[0] + values[1]) % 2) == 0) {
            // send 95% of the deposits to player 1
            (bool success2, ) = players[0].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
            // announe the game result
            emit GameResult(
                values[0],
                values[1],
                deposits[0] + deposits[1],
                "Player 1 wins"
            );

        // if the sum of the random numbers is an odd number, player 2 wins
        } else {
            // send 95% of the deposits to player 2
            (bool success2, ) = players[1].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
            // announe the game result
            emit GameResult(
                values[0],
                values[1],
                deposits[0] + deposits[1],
                "Player 2 wins"
            );
        }
        stage += 1;
    }
}
