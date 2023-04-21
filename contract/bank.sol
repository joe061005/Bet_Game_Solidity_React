// SPDX-License-Identifier: MIT
pragma solidity ^0.8;
import "@openzeppelin/contracts/utils/Strings.sol";

contract Bank {
    address payable owner;
    address payable[2] players;
    uint256 stage;
    bytes32[2] hashes;
    uint256[2] values;
    uint256[2] deposits;

    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner");
        _;
    }

    modifier onlyPlayer() {
        require(
            msg.sender == players[0] || msg.sender == players[1],
            "You must be one of the players"
        );
        _;
    }

    modifier onlyPlayerOrOwner() {
        require(
            msg.sender == players[0] ||
                msg.sender == players[1] ||
                msg.sender == owner,
            "You must be one of the players or owner"
        );
        _;
    }

    modifier onlyNotStarted() {
        require(
            players[0] == address(0) || players[1] == address(0),
            "You cannot refund after the game has started"
        );
        _;
    }

    event GameResult(
        uint256 player1_value,
        uint256 player2_value,
        uint256 deposit_amount,
        string winner
    );

    constructor() {
        owner = payable(address(0xc267E4A288AF6d23c358F65CD987B252D7057E89));
        stage = 0;
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }

    // refund 98% of the deposit if the player does not reveal for a long time
    function refundForOwner() public onlyOwner {
        if (stage == 2) {
            (bool success1, ) = players[1].call{
                value: (deposits[1] / 100) * 98
            }("");
            require(success1);
            (bool success2, ) = players[0].call{value: deposits[0]}("");
            require(success2);
        } else if (stage == 3) {
            (bool success1, ) = players[0].call{
                value: (deposits[0] / 100) * 98
            }("");
            require(success1);
            (bool success2, ) = players[1].call{value: deposits[1]}("");
            require(success2);
        }
        stage = 5;
        init_game();
    }

    // refund 98% of the deposit if the player wants to refund
    // 2% for the transaction fee
    function refund() public onlyPlayer {
        if (msg.sender == players[0]) {
            (bool success1, ) = players[0].call{
                value: (deposits[0] / 100) * 98
            }("");
            require(success1);
            if (players[1] != address(0)){
                (bool success2, ) = players[1].call{value: deposits[1]}("");
                require(success2);
            }

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

    function get_stage() public view returns (uint256) {
        return stage;
    }

    function get_players() public view returns (address, address) {
        return (players[0], players[1]);
    }

    function get_values() public view returns (uint256, uint256) {
        return (values[0], values[1]);
    }

    function init_game() public {
        require(
            stage == 5 || msg.sender == owner,
            "Please wait until the game has ended"
        );
        stage = 0;
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }

    function set_commitment(bytes32 commitment) public payable {
        require(
            stage == 0 || stage == 1,
            "Please wait until the game has ended"
        );
        require(msg.value == 20 ether, "You need to deposit 20 ETH");
        require(
            msg.sender != players[0] && msg.sender != players[1],
            "You have joined the game"
        );
        if (stage == 0) {
            players[0] = payable(msg.sender);
            hashes[0] = commitment;
            deposits[0] = msg.value;
        } else {
            players[1] = payable(msg.sender);
            hashes[1] = commitment;
            deposits[1] = msg.value;
        }
        stage += 1;
    }

    function reveal(uint256 _value, string calldata salt) public onlyPlayer {
        if (msg.sender == players[0]) {
            require(stage == 3, "It is not the time for player 1 to reveal");
            require(
                hashes[0] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), salt)
                        )
                    ),
                "Invalid value and salt"
            );
            values[0] = _value;
        } else {
            require(stage == 2, "It is not the time for player 2 to reveal");
            require(
                hashes[1] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), salt)
                        )
                    ),
                "Invalid value and salt"
            );
            values[1] = _value;
        }
        stage += 1;
    }

    function settle() public onlyPlayerOrOwner {
        require(stage == 4, "It is not the time to settle");
        (bool success1, ) = owner.call{
            value: ((deposits[0] + deposits[1]) / 100) * 5
        }("");
        require(success1);
        if (((values[0] + values[1]) % 2) == 0) {
            (bool success2, ) = players[0].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
            emit GameResult(
                values[0],
                values[1],
                deposits[0] + deposits[1],
                "Player 1 wins"
            );
        } else {
            (bool success2, ) = players[1].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
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
