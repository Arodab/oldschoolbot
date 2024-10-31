import { readFileSync, writeFileSync } from 'node:fs';
import { calcPerHour, toTitleCase } from '@oldschoolgg/toolkit';
import { glob } from 'glob';
import { Bank, EItem, Monsters } from 'oldschooljs';

import '../src/lib/safeglobals';
import process from 'node:process';
import { groupBy, uniqueBy } from 'remeda';
import { type CombatAchievement, CombatAchievements } from '../src/lib/combat_achievements/combatAchievements';
import { COXMaxMageGear, COXMaxMeleeGear, COXMaxRangeGear, itemBoosts } from '../src/lib/data/cox';
import killableMonsters from '../src/lib/minions/data/killableMonsters';
import { quests } from '../src/lib/minions/data/quests';
import Fishing from '../src/lib/skilling/skills/fishing';
import { sorts } from '../src/lib/sorts';
import { itemNameFromID } from '../src/lib/util';
import { Markdown, Tab, Table, Tabs } from './markdown/markdown';

function combatAchievementHowToFinish(ca: CombatAchievement) {
	if ('rng' in ca) {
		return `1 in ${ca.rng.chancePerKill} chance per kill`;
	}
	if ('requirements' in ca) {
		return ca.requirements.requirements
			.map(req => ca.requirements.formatRequirement(req))
			.join(',')
			.replace('Kill Count Requirement: ', '')
			.replace('Minigame Requirements: ', '');
	}
	throw ca;
}

export function handleMarkdownEmbed(identifier: string, filePath: string, contentToInject: string) {
	const contentToReplace = readFileSync(`./docs/src/content/docs/${filePath}`, 'utf8');
	const startMarker = `[[embed.${identifier}.start]]`;
	const endMarker = `[[embed.${identifier}.end]]`;
	const startIndex = contentToReplace.indexOf(startMarker);
	const endIndex = contentToReplace.indexOf(endMarker);

	if (startIndex === -1 || endIndex === -1) {
		console.error(`Markers (not found in the file. ${filePath} ${identifier}`);
		process.exit(1);
	}

	const newContent = `${contentToReplace.slice(0, startIndex + startMarker.length)}
{/* DO NOT EDIT - This section is auto-generated by the build script */}
${contentToInject}
{/* DO NOT EDIT - This section is auto-generated by the build script */}
${contentToReplace.slice(endIndex)}`;

	writeFileSync(`./docs/src/content/docs/${filePath}`, newContent, 'utf8');
}
async function renderCAMarkdown() {
	let markdown = '<Tabs>\n';
	for (const tier of Object.values(CombatAchievements)) {
		markdown += `<TabItem label="${tier.name}">
| Monster | Task Name | How To Unlock |
| -- | -- | -- |
`;
		for (const task of tier.tasks.sort((a, b) => a.monster.localeCompare(b.monster))) {
			markdown += `| ${task.monster} | ${task.name} | ${combatAchievementHowToFinish(task)} |\n`;
		}
		markdown += '</TabItem>\n';
	}
	markdown += '</Tabs>\n';
	handleMarkdownEmbed('ca_tasks', 'osb/combat-achievements.mdx', markdown);
}

function escapeItemName(str: string) {
	return str.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

const name = (id: number) => escapeItemName(itemNameFromID(id)!);
async function renderMonstersMarkdown() {
	const markdown = new Markdown();

	for (const monster of killableMonsters
		.filter(m => m.equippedItemBoosts || m.itemInBankBoosts || m.itemCost)
		.filter(m => Monsters.get(m.id)!.data.combatLevel >= 80 && !m.name.includes('Revenant'))
		.sort((a, b) => a.name.localeCompare(b.name))) {
		const monstermd = new Markdown();
		monstermd.addLine(`## ${monster.name}`);

		const infoTab = new Tab().setTitle('Information').setContent(() => {
			const md = new Markdown();
			md.addLine(
				`- You can view the drops for this monster on the osrs wiki: [${monster.name}](https://oldschool.runescape.wiki/w/${encodeURIComponent(monster.name)})`
			);
			md.addLine(`- You can send your minion to kill this monster using: [[/k name:${monster.name}]]`);
			md.addLine(`- You can check your KC using: [[/minion kc name:${monster.name}]]`);
			md.addLine(`- You can check the KC leaderboard using: [[/lb kc monster\:${monster.name}]]`);
			md.addLine(`- You can check your collection log using: [[/cl name\\:${monster.name}]]`);
			md.addLine(`- You can check the collection log leaderboard using: [[/lb cl cl:${monster.name}]]`);

			if (monster.canBarrage) {
				md.addLine(`- You can barrage this monster [[/k name:${monster.name} method:barrage]]`);
			}
			if (monster.canCannon) {
				md.addLine(`- You can dwarf multicannon this monster [[/k name:${monster.name} method:cannon]]`);
			}
			if (monster.canChinning) {
				md.addLine(`- You can use chinchompas on this monster [[/k name:${monster.name} method:chinning]]`);
			}
			if (monster.slayerOnly) {
				md.addLine('- You can only kill this monster on a slayer task');
			}
			if (monster.existsInCatacombs) {
				md.addLine('- If on a slayer task, this monster can be killed in the catacombs');
			}
			if (monster.canBePked) {
				md.addLine(
					'- This monster is in the wilderness, and you can die to PKers when killing it. As such, you will always use your "wildy" gear setup when killing this monster.'
				);
			}

			return md.toString();
		});

		const costsTab = new Tab().setTitle('Costs').setContent(() => {
			const md = new Markdown();
			md.addLine(
				`- ${monster.healAmountNeeded ? `Requires food in your bank to kill, the amount needed is heavily reduced based on your gear/experience. ${monster.minimumHealAmount ? `You must have/use food that heals atleast ${monster.healAmountNeeded}HP` : ''}` : 'No Food Needed'}`
			);
			if (monster.itemCost) {
				md.addLine('**Item Cost**');
				for (const consumable of Array.isArray(monster.itemCost) ? monster.itemCost : [monster.itemCost]) {
					const allConsumables = [consumable, ...[consumable.alternativeConsumables ?? []]].flat();
					md.addLine(
						`- ${allConsumables.map(c => `${c.itemCost.itemIDs.map(id => `[[${name(id)}]]`).join(' ')}`).join(' or ')}`
					);
				}
			}

			if (monster.projectileUsage) {
				md.addLine('- Uses arrows/projectiles from your range gear');
			}

			return md.toString();
		});

		const requirementsTab = new Tab().setTitle('Requirements').setContent(() => {
			const requirementsMarkdown = new Markdown();

			if (monster.qpRequired) {
				requirementsMarkdown.addLine(`[[qp:${monster.qpRequired}]]`);
			}

			if (monster.levelRequirements) {
				requirementsMarkdown.addLine(
					Object.entries(monster.levelRequirements)
						.map(([skill, lvl]) => `[[${skill}:${lvl}]]`)
						.join(' ')
				);
			}

			if (monster.itemsRequired && monster.itemsRequired?.length > 0) {
				requirementsMarkdown.addLine('**Items Required**');
				for (const item of monster.itemsRequired) {
					if (Array.isArray(item)) {
						requirementsMarkdown.addLine(`- ${item.map(i => `[[${name(i)}]]`).join(' or ')}`);
					} else {
						requirementsMarkdown.addLine(`- [[${name(item)}]]`);
					}
				}
			}

			if (monster.requiredQuests) {
				requirementsMarkdown.addLine('**Required Quests**');
				for (const quest of monster.requiredQuests) {
					requirementsMarkdown.addLine(`- ${quests.find(q => q.id === quest)!.name}`);
				}
			}

			return requirementsMarkdown.toString();
		});

		const boostsTab = new Tab().setTitle('Boosts').setContent(() => {
			const boostsMarkdown = new Markdown();

			if (monster.itemInBankBoosts) {
				const bankBoosts = new Markdown();
				bankBoosts.setAccordion('Item in Bank Boosts');
				bankBoosts.addLine(
					'These boosts are applied from just being in your bank, and do not need to be equipped (but can also be equipped). The best boost you can use will automatically be used.'
				);
				for (const set of monster.itemInBankBoosts) {
					bankBoosts.addLine('You can have one of the following boosts:');
					for (const [item, boostPercent] of new Bank(set).items().sort(sorts.quantity)) {
						bankBoosts.addLine(`- ${boostPercent}% boost for [[${escapeItemName(item.name)}]]`);
					}
					bankBoosts.addLine('---');
				}
				boostsMarkdown.add(bankBoosts);
			}

			if (monster.equippedItemBoosts) {
				const bankBoosts = new Markdown();
				bankBoosts.setAccordion('Equipped Item Boosts');
				bankBoosts.addLine(
					'To get these boosts, you need the item equipped in the right setup. The best boost you can use will automatically be used.'
				);
				for (const set of monster.equippedItemBoosts) {
					bankBoosts.addLine(
						`${toTitleCase(set.gearSetup)} gear boosts${set.required ? ', it is **required** to have atleast one of these' : ''}:`
					);
					for (const item of set.items.sort((a, b) => b.boostPercent - a.boostPercent)) {
						bankBoosts.addLine(`- ${item.boostPercent}% boost for [[${name(item.itemID)}]]`);
					}
					bankBoosts.addLine('---');
				}
				boostsMarkdown.add(bankBoosts);
			}

			if (monster.degradeableItemUsage) {
				const bankBoosts = new Markdown();
				bankBoosts.setAccordion('Degradeable/Chargeable Item Boosts');
				bankBoosts.addLine('These boosts are for items which degrade or have charges.');
				for (const set of monster.degradeableItemUsage) {
					bankBoosts.addLine(
						`${toTitleCase(set.gearSetup)} gear boosts${set.required ? ', it is **required** to have atleast one of these' : ''}:`
					);
					for (const item of set.items.sort((a, b) => b.boostPercent - a.boostPercent)) {
						bankBoosts.addLine(`- ${item.boostPercent}% boost for [[${name(item.itemID)}]]`);
					}
					bankBoosts.addLine('---');
				}
				boostsMarkdown.add(bankBoosts);
			}

			if (monster.pohBoosts) {
				const pohBoosts = new Markdown();
				pohBoosts.setAccordion('POH Boosts');
				pohBoosts.addLine('These boosts are from having the right object built in your POH.');
				for (const [_pohSlot, boostGroup] of Object.entries(monster.pohBoosts).sort((a, b) =>
					a[0].localeCompare(b[0])
				)) {
					const mdSet = new Markdown();
					mdSet.addLine(`**${toTitleCase(_pohSlot)}**`);
					for (const [item, boostPercent] of Object.entries(boostGroup).sort((a, b) => b[1] - a[1])) {
						mdSet.addLine(`- ${boostPercent}% boost for ${item}`);
					}
					pohBoosts.add(mdSet);
				}
				pohBoosts.addLine('---');
				boostsMarkdown.add(pohBoosts);
			}

			return boostsMarkdown.toString();
		});
		const tabs = new Tabs([infoTab, costsTab, requirementsTab, boostsTab]);
		monstermd.add(tabs);
		monstermd.addLine('---');
		markdown.add(monstermd);
	}

	handleMarkdownEmbed('monsters', 'osb/monsters.mdx', markdown.toString());
}

function renderQuestsMarkdown() {
	const markdown = new Markdown();

	for (const quest of quests.sort((a, b) => a.name.localeCompare(b.name))) {
		const questMarkdown = new Markdown();
		questMarkdown.addLine(`## ${quest.name}`);
		questMarkdown.addLine(
			`You can send your minion to do this quest using [[/activities quest name:${quest.name}]]`
		);

		if (quest.skillReqs) {
			questMarkdown.addLine('### Skill Requirements');
			questMarkdown.addLine(
				`- Skills: ${Object.entries(quest.skillReqs)
					.map(([skill, lvl]) => `[[${skill}:${lvl}]]`)
					.join(' ')}`
			);
		}
		if (quest.ironmanSkillReqs) {
			questMarkdown.addLine('### Ironman Skill Requirements');
			questMarkdown.addLine(
				`${Object.entries(quest.ironmanSkillReqs)
					.map(([skill, lvl]) => `[[${skill}:${lvl}]]`)
					.join(' ')}`
			);
		}

		if (quest.prerequisitesQuests) {
			questMarkdown.addLine('### Required Quests');
			for (const req of quest.prerequisitesQuests) {
				questMarkdown.addLine(`- Must have finished ${quests.find(q => q.id === req)!.name}`);
			}
		}

		if (quest.combatLevelReq || quest.qpReq) {
			questMarkdown.addLine('### Other requirements');
			if (quest.combatLevelReq) {
				questMarkdown.addLine(`- Combat Level requirement: ${quest.combatLevelReq}`);
			}
			if (quest.qpReq) {
				questMarkdown.addLine(`- Quest Points requirement: [[qp:${quest.qpReq}]]`);
			}
		}

		if (quest.rewards) {
			questMarkdown.addLine('### Item Rewards');
			questMarkdown.addLine(
				quest.rewards
					.items()
					.map(([item]) => `[[${item.id}]]`)
					.join(' ')
			);
		}
		if (quest.skillsRewards) {
			questMarkdown.addLine('### XP Rewards');
			questMarkdown.addLine(
				Object.entries(quest.skillsRewards)
					.map(([skill, xp]) => `[[${skill}:${xp.toLocaleString()}]]`)
					.join(' ')
			);
		}

		markdown.add(questMarkdown);
	}

	handleMarkdownEmbed('quests', 'osb/quests.mdx', markdown.toString());
}

function rendeCoxMarkdown() {
	const markdown = new Markdown();

	markdown.addLine('## Gear');
	markdown.addLine('This is the best-in-slot gear you should use for CoX, substitute the next best items you have. ');
	for (const gear of [
		['mage', 'Magic Damage', COXMaxMageGear],
		['range', 'Ranged Strength', COXMaxRangeGear],
		['melee', 'Melee Strength', COXMaxMeleeGear]
	] as const) {
		markdown.addLine(`### ${toTitleCase(gear[0])}`);
		markdown.addLine(`For ${gear[0]}, use these items, or the next best '${gear[1]}' gear you have:`);
		markdown.addLine(
			`- ${gear[2]
				.allItems(false)
				.map(id => `[[${id}]]`)
				.join(' ')}`
		);
	}

	markdown.addLine('## Boosts');
	markdown.addLine(`Higher Kc makes raids faster. Here is the maximum kc that will give a boost:

| Difficulty | Solo Kc | Mass Kc |
| ---------- | ------- | ------- |
| Normal     | 250     | 400     |
| Challenge  | 75      | 100     |

`);
	for (const boostSet of itemBoosts) {
		markdown.addLine(
			`- ${boostSet
				.map(boost => {
					const messages: string[] = [];
					if (!boost.mustBeEquipped) {
						messages.push('Works from bank');
					}
					if (boost.mustBeCharged) {
						messages.push('Must be charged');
					}
					const msgStr = messages.length > 0 ? ` (${messages.join(', ')})` : '';
					return `${boost.boost}% boost for [[${boost.item.name}]]${msgStr}`;
				})
				.join(' or ')}`
		);
	}

	handleMarkdownEmbed('cox', 'osb/Raids/cox.mdx', markdown.toString());
}
function wikiIssues() {
	const untemplatedCommandRegex = /(?<!\[\[[^\]]*|[)\]]\s*)\/\w+/g;
	const unintendedHtmlRegex = /<td>/g;

	interface Issue {
		description: string;
		filePath: string;
		lineNumbers: number[];
	}

	const files = glob.sync('./docs/**/*.{md,mdx}', {
		ignore: ['**/node_modules/**']
	});

	const issues: Issue[] = [];

	for (const file of files) {
		const content = readFileSync(file, 'utf-8');
		const lines = content.split('\n');

		const untemplatedCommandLines: number[] = [];
		const unintendedHtmlLines: number[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (untemplatedCommandRegex.test(line)) {
				untemplatedCommandLines.push(i + 1);
			}
			if (unintendedHtmlRegex.test(line)) {
				unintendedHtmlLines.push(i + 1);
			}
		}

		if (untemplatedCommandLines.length > 0) {
			issues.push({
				description: 'Doesnt use the new command formatting',
				filePath: file,
				lineNumbers: untemplatedCommandLines
			});
		}

		if (unintendedHtmlLines.length > 0) {
			issues.push({
				description: 'Contains unintended HTML (e.g. `<td>`)',
				filePath: file,
				lineNumbers: unintendedHtmlLines
			});
		}
	}

	const markdown = new Markdown();
	const grouped = groupBy(
		issues.sort((a, b) => a.filePath.localeCompare(b.filePath)),
		i => i.filePath.replaceAll('\\', '/')
	);
	for (const [file, issues] of Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
		markdown.addLine(
			`[${file.replace('docs/src/content/docs', '')}](https://github.com/oldschoolgg/oldschoolbot/blob/master/${file.replaceAll(' ', '%20')}): ${issues.map(i => i.description).join(', ')}`
		);
	}

	handleMarkdownEmbed('wikiissues', 'getting-started/wiki.md', markdown.toString());
}

import { Time } from 'e';
import type { Fish } from '../src/lib/skilling/types';
import { determineFishingTrip } from '../src/mahoji/commands/fish';
import { determineFishingResult, temporaryFishingDataConvert } from '../src/tasks/minions/fishingActivity';
import { makeGearBank } from '../tests/unit/utils';

function fishingXPHr() {
	let allFishingResults: {
		spot: Fish;
		cmd: Exclude<ReturnType<typeof determineFishingTrip>, string>;
		trip: Exclude<ReturnType<typeof determineFishingResult>, string>;
		xpHr: number;
	}[] = [];
	const gearBank = makeGearBank({
		bank: new Bank()
			.add(EItem.DARK_FISHING_BAIT, 100_000_000)
			.add(EItem.SANDWORMS, 100_000_000)
			.add(EItem.SPIRIT_FLAKES, 100_000_000)
			.add(EItem.FISHING_BAIT, 100_000_000)
			.add(EItem.FEATHER, 100_000_000)
			.add(EItem.RAW_KARAMBWANJI, 100_000_000)
	});
	gearBank.skillsAsXP.fishing = 13_034_431;
	gearBank.skillsAsLevels.fishing = 99;
	gearBank.gear.skilling.equip('Fish sack barrel');
	gearBank.gear.skilling.equip('Crystal harpoon');

	for (const spot of Fishing.Fishes) {
		for (const isPowerfishing of [true, false]) {
			for (const spiritFlakes of [true, false]) {
				const cmd = determineFishingTrip({
					hasWildyEliteDiary: true,
					baseMaxTripLength: Time.Hour * 50,
					spot,
					gearBank,
					quantity: undefined,
					powerfish: isPowerfishing,
					spirit_flakes: spiritFlakes
				});
				if (typeof cmd === 'string') throw new Error(cmd);
				const trip = determineFishingResult({
					spot,
					gearBank,
					spiritFlakesToRemove: spiritFlakes ? 1 : undefined,
					fishingSpotResults: temporaryFishingDataConvert(spot, cmd.Qty, cmd.loot)
				});
				allFishingResults.push({
					spot,
					cmd,
					trip,
					xpHr: Math.floor(calcPerHour(trip.updateBank.xpBank.amount('fishing'), cmd.duration) / 500) * 500
				});
			}
		}
	}

	allFishingResults.sort((a, b) => b.xpHr - a.xpHr);
	allFishingResults = uniqueBy(allFishingResults, i =>
		[i.spot.name, i.cmd.isPowerfishing, i.cmd.isUsingSpiritFlakes, i.cmd.boosts].flat(100).join('|')
	);

	const markdown = new Markdown();

	markdown.addLine('## XP Rates');

	const table = new Table();
	table.addHeader('Spot', 'XP/Hr', 'Powerfishing', 'Spirit Flakes');
	for (const { cmd, xpHr, spot } of allFishingResults) {
		if (typeof cmd === 'string') throw new Error(cmd);
		table.addRow(
			spot.name,
			`${Math.floor(xpHr).toLocaleString()}/hr`,
			cmd.isPowerfishing ? 'Yes' : 'No',
			cmd.isUsingSpiritFlakes ? 'Yes' : 'No'
		);
	}
	markdown.add(table);

	handleMarkdownEmbed('fishing', 'osb/Skills/fishing/README.md', markdown.toString());
}

async function wiki() {
	renderQuestsMarkdown();
	rendeCoxMarkdown();
	wikiIssues();
	fishingXPHr();
	await Promise.all([renderCAMarkdown(), renderMonstersMarkdown()]);
	process.exit(0);
}

wiki();
