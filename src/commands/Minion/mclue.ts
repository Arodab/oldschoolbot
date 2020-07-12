import { CommandStore, KlasaMessage } from 'klasa';

import { BotCommand } from '../../lib/BotCommand';
import { stringMatches, formatDuration, rand, isWeekend } from '../../lib/util';
import { Activity, Tasks } from '../../lib/constants';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import reducedClueTime from '../../lib/minions/functions/reducedClueTime';
import hasArrayOfItemsEquipped from '../../lib/gear/functions/hasArrayOfItemsEquipped';
import itemID from '../../lib/util/itemID';
import { ClueActivityTaskOptions } from '../../lib/types/minions';
import ClueTiers from '../../lib/minions/data/clueTiers';
import { requiresMinion, minionNotBusy } from '../../lib/minions/decorators';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			oneAtTime: true,
			cooldown: 1,
			usage: '<quantity:int{1}|name:...string> [name:...string]',
			usageDelim: ' '
		});
	}

	invalidClue(msg: KlasaMessage) {
		return `That isn't a valid clue tier, the valid tiers are: ${ClueTiers.map(
			tier => tier.name
		).join(', ')}. For example, \`${msg.cmdPrefix}minion clue 1 easy\``;
	}

	@requiresMinion
	@minionNotBusy
	async run(msg: KlasaMessage, [quantity, tierName]: [number | string, string]) {
		await msg.author.settings.sync(true);

		if (typeof quantity === 'string') {
			tierName = quantity;
			quantity = 1;
		}

		if (!tierName) throw this.invalidClue(msg);

		const clueTier = ClueTiers.find(tier => stringMatches(tier.name, tierName));

		if (!clueTier) throw this.invalidClue(msg);

		const boosts = [];

		const [timeToFinish, percentReduced] = reducedClueTime(
			clueTier,
			msg.author.settings.get(UserSettings.ClueScores)[clueTier.id] ?? 1
		);

		if (percentReduced >= 1) boosts.push(`${percentReduced}% for clue score`);

		let duration = timeToFinish * quantity;

		if (duration > msg.author.maxTripLength) {
			throw `${msg.author.minionName} can't go on Clue trips longer than ${formatDuration(
				msg.author.maxTripLength
			)}, try a lower quantity. The highest amount you can do for ${
				clueTier.name
			} is ${Math.floor(msg.author.maxTripLength / timeToFinish)}.`;
		}

		const bank = msg.author.settings.get(UserSettings.Bank);
		const numOfScrolls = bank[clueTier.scrollID];

		if (!numOfScrolls || numOfScrolls < quantity) {
			throw `You don't have ${quantity} ${clueTier.name} clue scrolls.`;
		}

		await msg.author.removeItemFromBank(clueTier.scrollID, quantity);

		const randomAddedDuration = rand(1, 20);
		duration += (randomAddedDuration * duration) / 100;

		if (
			hasArrayOfItemsEquipped(
				[
					'Graceful hood',
					'Graceful top',
					'Graceful legs',
					'Graceful gloves',
					'Graceful boots',
					'Graceful cape'
				].map(itemID),
				msg.author.settings.get(UserSettings.Gear.Skilling)
			)
		) {
			boosts.push(`10% for Graceful`);
			duration *= 0.9;
		}

		if (isWeekend()) {
			boosts.push(`10% for Weekend`);
			duration *= 0.9;
		}

		const data: ClueActivityTaskOptions = {
			clueID: clueTier.id,
			userID: msg.author.id,
			channelID: msg.channel.id,
			quantity,
			duration,
			type: Activity.ClueCompletion,
			id: rand(1, 10_000_000),
			finishDate: Date.now() + duration
		};

		await addSubTaskToActivityTask(this.client, Tasks.ClueTicker, data);
		return msg.send(
			`${msg.author.minionName} is now completing ${data.quantity}x ${
				clueTier.name
			} clues, it'll take around ${formatDuration(duration)} to finish.${
				boosts.length > 0 ? `\n\n**Boosts:** ${boosts.join(', ')}` : ''
			}`
		);
	}
}
