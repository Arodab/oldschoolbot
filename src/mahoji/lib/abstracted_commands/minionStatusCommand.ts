import { toTitleCase } from '@oldschoolgg/toolkit';
import { BaseMessageOptions, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { stripNonAlphanumeric } from 'e';

import { ClueTiers } from '../../../lib/clues/clueTiers';
import { BitField, Emoji, minionBuyButton, PerkTier } from '../../../lib/constants';
import { getUsersFishingContestDetails } from '../../../lib/fishingContest';
import { clArrayUpdate } from '../../../lib/handleNewCLItems';
import { roboChimpSyncData, roboChimpUserFetch } from '../../../lib/roboChimp';
import { prisma } from '../../../lib/settings/prisma';
import { getUsersTame, shortTameTripDesc, tameLastFinishedActivity } from '../../../lib/tames';
import { makeComponents } from '../../../lib/util';
import { makeAutoContractButton, makeBirdHouseTripButton } from '../../../lib/util/globalInteractions';
import { minionStatus } from '../../../lib/util/minionStatus';
import { makeRepeatTripButtons } from '../../../lib/util/repeatStoredTrip';
import { getItemContractDetails } from '../../commands/ic';
import { spawnLampIsReady } from '../../commands/tools';
import { calculateBirdhouseDetails } from './birdhousesCommand';
import { isUsersDailyReady } from './dailyCommand';
import { canRunAutoContract } from './farmingContractCommand';

async function fetchFavoriteGearPresets(userID: string) {
	const pinnedPresets = await prisma.gearPreset.findMany({
		where: { user_id: userID, pinned_setup: { not: null } },
		orderBy: { times_equipped: 'desc' },
		take: 5
	});

	if (pinnedPresets.length === 0) return [];

	return pinnedPresets.map(i =>
		new ButtonBuilder()
			.setStyle(ButtonStyle.Secondary)
			.setCustomId(`GPE_${i.pinned_setup}_${stripNonAlphanumeric(i.name)}`)
			.setLabel(`Equip '${toTitleCase(i.name).replace(/_/g, ' ')}' to ${i.pinned_setup}`)
			.setEmoji(i.emoji_id ?? Emoji.Gear)
	);
}

async function fetchPinnedTrips(userID: string) {
	const pinnedPresets = await prisma.pinnedTrip.findMany({
		where: { user_id: userID },
		take: 5
	});

	if (pinnedPresets.length === 0) return [];

	return pinnedPresets.map(i =>
		new ButtonBuilder()
			.setStyle(ButtonStyle.Secondary)
			.setCustomId(`PTR_${i.id}`)
			.setLabel(`Repeat ${i.custom_name ?? i.activity_type}`)
			.setEmoji(i.emoji_id ?? '🔁')
	);
}

export async function minionStatusCommand(user: MUser, channelID: string): Promise<BaseMessageOptions> {
	const { minionIsBusy } = user;
	const [roboChimpUser, birdhouseDetails, gearPresetButtons, pinnedTripButtons, fishingResult, dailyIsReady] =
		await Promise.all([
			roboChimpUserFetch(user.id),
			minionIsBusy ? { isReady: false } : calculateBirdhouseDetails(user.id),
			minionIsBusy ? [] : fetchFavoriteGearPresets(user.id),
			minionIsBusy ? [] : fetchPinnedTrips(user.id),
			getUsersFishingContestDetails(user),
			isUsersDailyReady(user)
		]);

	roboChimpSyncData(user);
	await clArrayUpdate(user, user.cl);

	if (!user.user.minion_hasBought) {
		return {
			content:
				"You haven't bought a minion yet! Click the button below to buy a minion and start playing the bot.",
			components: [
				{
					components: [minionBuyButton],
					type: ComponentType.ActionRow
				}
			]
		};
	}

	const status = minionStatus(user);
	const buttons: ButtonBuilder[] = [];

	if (
		user.perkTier() >= PerkTier.Four &&
		fishingResult.catchesFromToday.length === 0 &&
		!user.minionIsBusy &&
		['Contest rod', "Beginner's tackle box"].every(i => user.hasEquippedOrInBank(i))
	) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('DO_FISHING_CONTEST')
				.setLabel('Fishing Contest')
				.setEmoji('630911040091193356')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	if (dailyIsReady.isReady) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('CLAIM_DAILY')
				.setLabel('Claim Daily')
				.setEmoji('493286312854683654')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	if (minionIsBusy) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('CANCEL_TRIP')
				.setLabel('Cancel Trip')
				.setEmoji('778418736180494347')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	if (!minionIsBusy) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('AUTO_SLAY')
				.setLabel('Auto Slay')
				.setEmoji('630911040560824330')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	buttons.push(
		new ButtonBuilder()
			.setCustomId('CHECK_PATCHES')
			.setLabel('Check Patches')
			.setEmoji(Emoji.Stopwatch)
			.setStyle(ButtonStyle.Secondary)
	);

	if (!minionIsBusy && birdhouseDetails.isReady && !user.bitfield.includes(BitField.DisableBirdhouseRunButton)) {
		buttons.push(makeBirdHouseTripButton());
	}

	if (
		!minionIsBusy &&
		(await canRunAutoContract(user)) &&
		!user.bitfield.includes(BitField.DisableAutoFarmContractButton)
	) {
		buttons.push(makeAutoContractButton());
	}

	if (!minionIsBusy) {
		const repeatButtons = await makeRepeatTripButtons(user);
		buttons.push(...repeatButtons);
	}

	const { bank } = user;

	if (!minionIsBusy) {
		for (const tier of ClueTiers.filter(t => bank.has(t.scrollID))
			.reverse()
			.slice(0, 3)) {
			buttons.push(
				new ButtonBuilder()
					.setCustomId(`DO_${tier.name.toUpperCase()}_CLUE`)
					.setLabel(`Do ${tier.name} Clue`)
					.setEmoji('365003979840552960')
					.setStyle(ButtonStyle.Secondary)
			);
		}
	}

	const perkTier = user.perkTier();
	if (perkTier >= PerkTier.Two) {
		const { tame, species, activity } = await getUsersTame(user);
		if (tame && !activity) {
			const lastTameAct = await tameLastFinishedActivity(user);
			if (lastTameAct) {
				buttons.push(
					new ButtonBuilder()
						.setCustomId('REPEAT_TAME_TRIP')
						.setLabel(`Repeat ${shortTameTripDesc(lastTameAct)}`)
						.setEmoji(species!.emojiID)
						.setStyle(ButtonStyle.Secondary)
				);
			}
		}
	}

	const [spawnLampReady] = spawnLampIsReady(user, channelID);
	if (spawnLampReady) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('SPAWN_LAMP')
				.setLabel('Spawn Lamp')
				.setEmoji('988325171498721290')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	const icDetails = getItemContractDetails(user);
	if (perkTier >= PerkTier.Two && icDetails.currentItem && icDetails.owns) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId('ITEM_CONTRACT_SEND')
				.setLabel(`IC: ${icDetails.currentItem.name.slice(0, 20)}`)
				.setEmoji('988422348434718812')
				.setStyle(ButtonStyle.Secondary)
		);
	}

	if (roboChimpUser.leagues_points_total === 0) {
		buttons.push(
			new ButtonBuilder()
				.setLabel('OSB/BSO Leagues')
				.setEmoji('660333438016028723')
				.setStyle(ButtonStyle.Link)
				.setURL('https://bso-wiki.oldschool.gg/leagues')
		);
	}

	if (gearPresetButtons.length > 0) {
		buttons.push(...gearPresetButtons);
	}
	if (pinnedTripButtons.length > 0) {
		buttons.push(...pinnedTripButtons);
	}

	return {
		content: status,
		components: makeComponents(buttons)
	};
}
