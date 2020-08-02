import { Task } from 'klasa';
import { Monsters } from 'oldschooljs';

import { bankHasItem, roll } from '../../lib/util';
import { Events, Emoji } from '../../lib/constants';
import { FarmingActivityTaskOptions } from '../../lib/types/minions';
import Farming from '../../lib/skilling/skills/farming/farming';
import { channelIsSendable } from '../../lib/util/channelIsSendable';
import { SkillsEnum } from '../../lib/skilling/types';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import createReadableItemListFromBank from '../../lib/util/createReadableItemListFromTuple';
import itemID from '../../lib/util/itemID';
import { rand } from 'oldschooljs/dist/util/util';
import { calcVariableYield } from '../../lib/skilling/functions/calcsFarming';
import guildmasterJaneImage from '../../lib/image/guildmasterJaneImage';
import { PatchTypes } from '../../lib/farming';

export default class extends Task {
	async run({
		plantsName,
		patchType,
		getPatchType,
		quantity,
		upgradeType,
		userID,
		channelID,
		msg,
		planting,
		duration,
		currentDate
	}: FarmingActivityTaskOptions) {
		const user = await this.client.users.fetch(userID);
		const currentFarmingLevel = user.skillLevel(SkillsEnum.Farming);
		const currentWoodcuttingLevel = user.skillLevel(SkillsEnum.Woodcutting);
		let baseBonus = 1;
		let bonusXP = 0;
		let plantXp = 0;
		let harvestXp = 0;
		let compostXp = 0;
		let checkHealthXp = 0;
		let rakeXp = 0;
		let woodcuttingXp = 0;
		let payStr = '';
		let wcStr = '';
		let rakeStr = '';
		let plantingStr = '';
		let alivePlants = 0;
		let chopped = false;
		let farmingXpReceived = 0;
		let chanceOfDeathReduction = 1;
		let cropYield = 0;
		let lives = 3;
		let bonusXpMultiplier = 0;
		let farmersPiecesCheck = 0;

		const plant = Farming.Plants.find(plant => plant.name === plantsName);

		if (msg.author.hasItem(itemID('Magic secateurs'), 1)) {
			baseBonus += 0.1;
		}

		if (
			msg.author.hasItem(itemID('Farming cape'), 1) ||
			msg.author.hasItem(itemID('Farming cape(t)'), 1)
		) {
			baseBonus += 0.05;
		}

		if (upgradeType === 'compost') compostXp = 18;
		if (upgradeType === 'supercompost') compostXp = 26;
		if (upgradeType === 'ultracompost') compostXp = 36;

		// initial lives = 3. Compost, super, ultra, increases lives by 1 respectively and reduces chanceofdeath as well.
		// Payment = 0% chance of death
		if (patchType.lastUpgradeType === 'compost') {
			lives += 1;
			chanceOfDeathReduction = 1 / 2;
		} else if (patchType.lastUpgradeType === 'supercompost') {
			lives += 2;
			chanceOfDeathReduction = 1 / 5;
		} else if (patchType.lastUpgradeType === 'ultracompost') {
			lives += 3;
			chanceOfDeathReduction = 1 / 10;
		}

		if (patchType.lastPayment) chanceOfDeathReduction = 0;

		// check bank for farmer's items
		const userBank = user.settings.get(UserSettings.Bank);

		if (bankHasItem(userBank, itemID(`Farmer's strawhat`), 1)) {
			bonusXpMultiplier += 0.004;
			farmersPiecesCheck++;
		}
		if (
			bankHasItem(userBank, itemID(`Farmer's jacket`), 1) ||
			bankHasItem(userBank, itemID(`Farmer's shirt`), 1)
		) {
			bonusXpMultiplier += 0.008;
			farmersPiecesCheck++;
		}
		if (bankHasItem(userBank, itemID(`Farmer's boro trousers`), 1)) {
			bonusXpMultiplier += 0.006;
			farmersPiecesCheck++;
		}
		if (bankHasItem(userBank, itemID(`Farmer's boots`), 1)) {
			bonusXpMultiplier += 0.002;
			farmersPiecesCheck++;
		}
		if (farmersPiecesCheck === 4) bonusXpMultiplier += 0.005;

		let loot = {
			[itemID('Weeds')]: 0
		};

		delete loot[itemID('Weeds')];

		if (!patchType.patchStage) {
			if (!plant) return;

			rakeXp = quantity * 4 * 3; // # of patches * exp per weed * # of weeds
			plantXp = quantity * (plant.plantXp + compostXp);
			farmingXpReceived = plantXp + harvestXp + rakeXp;

			loot[itemID('Weeds')] = quantity * 3;

			let str = `${user}, ${
				user.minionName
			} finished raking ${quantity} patches and planting ${quantity}x ${
				plant.name
			}.\nYou received ${plantXp.toLocaleString()} XP from planting and ${rakeXp.toLocaleString()} XP from raking for a total of ${farmingXpReceived.toLocaleString()} Farming XP.`;

			bonusXP += Math.floor(farmingXpReceived * bonusXpMultiplier);
			if (bonusXP > 0) {
				str += ` You received an additional ${bonusXP.toLocaleString()} in bonus XP.`;
			}

			await user.addXP(SkillsEnum.Farming, Math.floor(farmingXpReceived + bonusXP));
			const newLevel = user.skillLevel(SkillsEnum.Farming);

			if (newLevel > currentFarmingLevel) {
				str += `\n\n${user.minionName}'s Farming level is now ${newLevel}!`;
			}

			if (Object.keys(loot).length > 0) {
				str += `\n\nYou received: ${await createReadableItemListFromBank(
					this.client,
					loot
				)}.`;
			}

			await user.addItemsToBank(loot, true);

			const updatePatches = {
				lastPlanted: plant.name,
				patchStage: true,
				plantTime: currentDate + duration,
				lastQuantity: quantity,
				lastUpgradeType: upgradeType,
				lastPayment: patchType.lastPayment
			};

			await msg.author.settings.update(getPatchType, updatePatches);

			str += `\n\n${user.minionName} tells you to come back after your plants have finished growing!`;

			const channel = this.client.channels.get(channelID);
			if (!channelIsSendable(channel)) return;

			channel.send(str);
		} else if (patchType.patchStage) {
			const plantToHarvest = Farming.Plants.find(
				plant => plant.name === patchType.lastPlanted
			);
			if (!plantToHarvest) return;
			if (!plant) return;

			let quantityDead = 0;
			for (let i = 0; i < patchType.lastQuantity; i++) {
				for (let j = 0; j < plantToHarvest.numOfStages - 1; j++) {
					const checkIfDied = Math.random();
					if (
						checkIfDied <
						Math.floor(plantToHarvest.chanceOfDeath * chanceOfDeathReduction) / 128
					) {
						quantityDead += 1;
						break;
					}
				}
			}

			alivePlants = patchType.lastQuantity - quantityDead;

			if (planting) {
				plantXp = quantity * (plant.plantXp + compostXp);
			}
			checkHealthXp = alivePlants * plantToHarvest.checkXp;

			if (plantToHarvest.givesCrops) {
				if (!plantToHarvest.outputCrop) return;
				if (plantToHarvest.variableYield) {
					cropYield = calcVariableYield(
						plantToHarvest,
						patchType.lastUpgradeType,
						currentFarmingLevel
					);
				} else if (plantToHarvest.fixedOutput) {
					if (!plantToHarvest.fixedOutputAmount) return;
					cropYield = plantToHarvest.fixedOutputAmount;
				} else {
					const plantChanceFactor =
						Math.floor(
							Math.floor(
								plantToHarvest.chance1 +
									(plantToHarvest.chance99 - plantToHarvest.chance1) *
										((user.skillLevel(SkillsEnum.Farming) - 1) / 98)
							) * baseBonus
						) + 1;
					const chanceToSaveLife = (plantChanceFactor + 1) / 256;
					if (plantToHarvest.seedType === 'bush') lives = 4;
					cropYield = 0;
					const livesHolder = lives;
					for (let k = 0; k < alivePlants; k++) {
						lives = livesHolder;
						for (let n = 0; lives > 0; n++) {
							if (Math.random() > chanceToSaveLife) {
								lives -= 1;
								cropYield += 1;
							} else {
								cropYield += 1;
							}
						}
					}
				}

				if (quantity > patchType.lastQuantity) {
					loot[plantToHarvest.outputCrop] = cropYield;
					loot[itemID('Weeds')] = quantity - patchType.lastQuantity;
				} else {
					loot[plantToHarvest.outputCrop] = cropYield;
				}

				if (plantToHarvest.name === 'Limpwurt') harvestXp = plantToHarvest.harvestXp;
				else harvestXp = cropYield * plantToHarvest.harvestXp;
			}

			if (plantToHarvest.needsChopForHarvest) {
				if (!plantToHarvest.treeWoodcuttingLevel) return;
				if (currentWoodcuttingLevel >= plantToHarvest.treeWoodcuttingLevel) chopped = true;
				else {
					await msg.author.settings.sync(true);
					const GP = msg.author.settings.get(UserSettings.GP);
					if (GP < 200 * alivePlants) {
						throw `You do not have the required woodcutting level or enough GP to clear your patches in order to be able to plant more.`;
					} else {
						payStr = `*You did not have the woodcutting level required, so you paid a nearby farmer 200 GP per patch to remove the previous tree.*`;
						await msg.author.removeGP(200 * alivePlants);
					}

					harvestXp = 0;
				}
				if (plantToHarvest.givesLogs && chopped) {
					if (!plantToHarvest.outputLogs) return;
					if (!plantToHarvest.woodcuttingXp) return;
					const amountOfLogs = rand(5, 10);
					loot[plantToHarvest.outputLogs] = amountOfLogs * alivePlants;

					woodcuttingXp += alivePlants * amountOfLogs * plantToHarvest.woodcuttingXp;
					wcStr = ` You also received ${woodcuttingXp.toLocaleString()} Woodcutting XP.`;

					harvestXp = 0;
				} else if (plantToHarvest.givesCrops && chopped) {
					if (!plantToHarvest.outputCrop) return;
					loot[plantToHarvest.outputCrop] = cropYield * alivePlants;

					harvestXp = cropYield * alivePlants * plantToHarvest.harvestXp;
				}
			}

			if (quantity > patchType.lastQuantity) {
				loot[6055] = (quantity - patchType.lastQuantity) * 3; // weeds
				rakeXp = (quantity - patchType.lastQuantity) * 3 * 4;
				rakeStr += ` ${rakeXp} XP for raking, `;
			}

			farmingXpReceived = plantXp + harvestXp + checkHealthXp + rakeXp;
			let deathStr = '';
			if (quantityDead > 0) {
				deathStr = ` During your harvest, you found that ${quantityDead}/${patchType.lastQuantity} of your plants died.`;
			}

			if (planting) {
				plantingStr = `${user}, ${user.minionName} finished planting ${quantity}x ${plant.name} and `;
			} else plantingStr = `${user}, ${user.minionName} finished `;

			let str = `${plantingStr}harvesting ${patchType.lastQuantity}x ${
				plantToHarvest.name
			}.${deathStr}${payStr}\n\nYou received ${plantXp.toLocaleString()} XP for planting, ${rakeStr}${harvestXp.toLocaleString()} XP for harvesting, and ${checkHealthXp.toLocaleString()} XP for checking health for a total of ${farmingXpReceived.toLocaleString()} Farming XP.${wcStr}\n`;

			bonusXP += Math.floor(farmingXpReceived * bonusXpMultiplier);

			if (bonusXP > 0) {
				str += `You received an additional ${bonusXP.toLocaleString()} bonus XP from your farmer's outfit.`;
			}

			await user.addXP(SkillsEnum.Farming, Math.floor(farmingXpReceived + bonusXP));
			await user.addXP(SkillsEnum.Woodcutting, Math.floor(woodcuttingXp));

			const newFarmingLevel = user.skillLevel(SkillsEnum.Farming);
			const newWoodcuttingLevel = user.skillLevel(SkillsEnum.Woodcutting);

			if (newFarmingLevel > currentFarmingLevel) {
				str += `\n\n${user.minionName}'s Farming level is now ${newFarmingLevel}!`;
			}

			if (newWoodcuttingLevel > currentWoodcuttingLevel) {
				str += `\n\n${user.minionName}'s Woodcutting level is now ${newWoodcuttingLevel}!`;
			}

			let tangleroot = false;
			if (plantToHarvest.seedType === 'hespori') {
				await user.incrementMonsterScore(Monsters.Hespori.id);
				const hesporiLoot = Monsters.Hespori.kill(1, { farmingLevel: currentFarmingLevel });
				loot = hesporiLoot;
				if (Object.keys(loot).length > 2) {
					tangleroot = true;
				}
			} else if (
				patchType.patchStage &&
				plantToHarvest.petChance &&
				roll(
					(plantToHarvest.petChance - user.skillLevel(SkillsEnum.Farming) * 25) /
						alivePlants
				)
			) {
				loot[itemID('Tangleroot')] = 1;
				tangleroot = true;
			}

			if (tangleroot) {
				str += '\n```diff';
				str += `\n- You have a funny feeling you're being followed...`;
				str += '```';
				this.client.emit(
					Events.ServerNotification,
					`${Emoji.Farming} **${user.username}'s** minion, ${user.minionName}, just received a Tangleroot while farming ${patchType.lastPlanted} at level ${currentFarmingLevel} Farming!`
				);
			}

			let updatePatches: PatchTypes.PatchData;
			if (planting) {
				updatePatches = {
					lastPlanted: plant.name,
					patchStage: true,
					plantTime: currentDate + duration,
					lastQuantity: quantity,
					lastUpgradeType: upgradeType,
					lastPayment: patchType.lastPayment
				};
			} else {
				updatePatches = {
					lastPlanted: '',
					patchStage: false,
					plantTime: 0,
					lastQuantity: 0,
					lastUpgradeType: '',
					lastPayment: false
				};
			}

			await msg.author.settings.update(getPatchType, updatePatches);

			const currentContract = msg.author.settings.get(
				UserSettings.FarmingContracts.FarmingContract
			);

			const { contractsCompleted } = currentContract;

			let janeMessage;
			if (plantToHarvest.name === currentContract.plantToGrow && alivePlants > 0) {
				const farmingContractUpdate = {
					contractStatus: false as boolean,
					contractType: '' as 'easy' | 'medium' | 'hard' | '',
					plantToGrow: '' as string,
					seedPatchTier: currentContract.plantTier as 0 | 1 | 2 | 3 | 4 | 5,
					plantTier: 0 as 0 | 1 | 2 | 3 | 4 | 5,
					contractsCompleted: (contractsCompleted + 1) as number
				};

				msg.author.settings.update(
					UserSettings.FarmingContracts.FarmingContract,
					farmingContractUpdate
				);
				loot[itemID('Seed pack')] = 1;

				janeMessage = true;
			}

			if (Object.keys(loot).length > 0) {
				str += `\nYou received: ${await createReadableItemListFromBank(
					this.client,
					loot
				)}.`;
			}

			str += `\n\n${user.minionName} tells you to come back after your plants have finished growing! `;

			await user.addItemsToBank(loot, true);

			const channel = this.client.channels.get(channelID);
			if (!channelIsSendable(channel)) return;

			msg.author.incrementMinionDailyDuration(duration);

			channel.send(str);
			if (janeMessage) {
				return msg.send(
					await guildmasterJaneImage(
						`You've completed your contract and I have rewarded you with 1 Seed pack. Please open this Seed pack before asking for a new contract!\nYou have completed ${contractsCompleted +
							1} farming contracts.`
					)
				);
			}
		}
	}
}
