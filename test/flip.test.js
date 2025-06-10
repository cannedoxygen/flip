const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FLIP Game", function () {
  let flipToken;
  let flipGame;
  let owner;
  let player1;
  let player2;

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();

    // Deploy FLIP Token
    const FLIPToken = await ethers.getContractFactory("FLIPToken");
    flipToken = await FLIPToken.deploy();
    await flipToken.deployed();

    // Deploy FlipGame
    const FlipGame = await ethers.getContractFactory("FlipGame");
    flipGame = await FlipGame.deploy(flipToken.address);
    await flipGame.deployed();

    // Set up initial pot
    const initialPot = ethers.utils.parseEther("10000");
    await flipToken.approve(flipGame.address, initialPot);
    await flipGame.depositToPot(initialPot);

    // Give players some tokens
    const playerTokens = ethers.utils.parseEther("1000");
    await flipToken.transfer(player1.address, playerTokens);
    await flipToken.transfer(player2.address, playerTokens);
  });

  describe("Token Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      expect(await flipToken.name()).to.equal("FLIP Token");
      expect(await flipToken.symbol()).to.equal("FLIP");
    });

    it("Should mint initial supply to owner", async function () {
      const initialSupply = ethers.utils.parseEther("1000000000");
      expect(await flipToken.balanceOf(owner.address)).to.be.above(initialSupply.sub(ethers.utils.parseEther("12000")));
    });
  });

  describe("FlipGame Deployment", function () {
    it("Should set correct token address", async function () {
      expect(await flipGame.flipToken()).to.equal(flipToken.address);
    });

    it("Should have initial pot", async function () {
      const pot = await flipGame.pot();
      expect(pot).to.equal(ethers.utils.parseEther("10000"));
    });
  });

  describe("Flip Functionality", function () {
    it("Should reject flip without approval", async function () {
      const wager = ethers.utils.parseEther("100");
      await expect(
        flipGame.connect(player1).flip(wager)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should reject flip larger than pot", async function () {
      const wager = ethers.utils.parseEther("6000"); // More than pot can payout
      await flipToken.connect(player1).approve(flipGame.address, wager);
      
      await expect(
        flipGame.connect(player1).flip(wager)
      ).to.be.revertedWith("Pot too small for potential payout");
    });

    it("Should execute flip with proper approval", async function () {
      const wager = ethers.utils.parseEther("100");
      await flipToken.connect(player1).approve(flipGame.address, wager);
      
      const initialBalance = await flipToken.balanceOf(player1.address);
      const initialPot = await flipGame.pot();
      
      const tx = await flipGame.connect(player1).flip(wager);
      const receipt = await tx.wait();
      
      // Check FlipResult event was emitted
      const flipEvent = receipt.events?.find(e => e.event === "FlipResult");
      expect(flipEvent).to.not.be.undefined;
      expect(flipEvent.args.player).to.equal(player1.address);
      expect(flipEvent.args.wager).to.equal(wager);
      
      // Check balance changes
      const finalBalance = await flipToken.balanceOf(player1.address);
      const finalPot = await flipGame.pot();
      
      if (flipEvent.args.won) {
        // Player won - should receive payout
        expect(finalBalance).to.be.above(initialBalance);
        expect(finalPot).to.be.below(initialPot);
      } else {
        // Player lost - wager goes to pot (minus house edge)
        expect(finalBalance).to.equal(initialBalance.sub(wager));
        expect(finalPot).to.be.above(initialPot);
      }
    });

    it("Should handle house edge correctly", async function () {
      const wager = ethers.utils.parseEther("100");
      await flipToken.connect(player1).approve(flipGame.address, wager);
      
      const initialHouseBalance = await flipGame.houseBalance();
      
      await flipGame.connect(player1).flip(wager);
      
      const finalHouseBalance = await flipGame.houseBalance();
      const expectedHouseCut = wager.mul(200).div(10000); // 2%
      
      expect(finalHouseBalance).to.equal(initialHouseBalance.add(expectedHouseCut));
    });
  });

  describe("Pot Management", function () {
    it("Should allow owner to deposit to pot", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      await flipToken.approve(flipGame.address, depositAmount);
      
      const initialPot = await flipGame.pot();
      await flipGame.depositToPot(depositAmount);
      const finalPot = await flipGame.pot();
      
      expect(finalPot).to.equal(initialPot.add(depositAmount));
    });

    it("Should reject non-owner pot deposit", async function () {
      const depositAmount = ethers.utils.parseEther("1000");
      await flipToken.connect(player1).approve(flipGame.address, depositAmount);
      
      await expect(
        flipGame.connect(player1).depositToPot(depositAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("House Balance Management", function () {
    it("Should allow owner to withdraw house balance", async function () {
      // First, generate some house balance by having players lose
      const wager = ethers.utils.parseEther("100");
      await flipToken.connect(player1).approve(flipGame.address, wager);
      await flipGame.connect(player1).flip(wager);
      
      const houseBalance = await flipGame.houseBalance();
      if (houseBalance.gt(0)) {
        const initialOwnerBalance = await flipToken.balanceOf(owner.address);
        
        await flipGame.withdrawHouseBalance(houseBalance);
        
        const finalOwnerBalance = await flipToken.balanceOf(owner.address);
        expect(finalOwnerBalance).to.equal(initialOwnerBalance.add(houseBalance));
      }
    });

    it("Should reject non-owner house withdrawal", async function () {
      await expect(
        flipGame.connect(player1).withdrawHouseBalance(1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Multiple Flips", function () {
    it("Should handle multiple consecutive flips", async function () {
      const wager = ethers.utils.parseEther("50");
      await flipToken.connect(player1).approve(flipGame.address, wager.mul(5));
      
      for (let i = 0; i < 5; i++) {
        await flipGame.connect(player1).flip(wager);
      }
      
      // Should complete without errors
      const finalBalance = await flipToken.balanceOf(player1.address);
      expect(finalBalance).to.be.below(ethers.utils.parseEther("1000"));
    });
  });
});
