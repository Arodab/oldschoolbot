import { Monsters } from 'oldschooljs';
import { join } from 'path';

export const enum Time {
	Millisecond = 1,
	Second = 1000,
	Minute = 1000 * 60,
	Hour = 1000 * 60 * 60,
	Day = 1000 * 60 * 60 * 24,
	Month = 1000 * 60 * 60 * 24 * 30,
	Year = 1000 * 60 * 60 * 24 * 365
}

export const enum Channel {
	Notifications = '469523207691436042',
	ErrorLogs = '665678499578904596'
}

export const enum Emoji {
	MoneyBag = '<:MoneyBag:493286312854683654>',
	OSBot = '<:OSBot:601768469905801226>',
	Joy = '😂',
	Bpaptu = '<:bpaptu:660333438292983818>',
	Diamond = '💎',
	Dice = '<:dice:660128887111548957>',
	Minion = '<:minion:660517408968146946>',
	Fireworks = '🎆',
	Tick = '✅',
	Search = '🔎',
	FancyLoveheart = '💝',
	Gift = '🎁',
	Sad = '<:RSSad:380915244652036097>',
	Happy = '<:RSHappy:380915244760825857>',
	PeepoOSBot = '<:peepoOSBot:601695641088950282>',
	PeepoSlayer = '<:peepoSlayer:644411576425775104>',
	PeepoRanger = '<:peepoRanger:663096705746731089>',
	PeepoNoob = '<:peepoNoob:660712001500086282>'
}

export const enum Image {
	DiceBag = 'https://i.imgur.com/sySQkSX.png'
}

export const enum Color {
	Orange = 16098851
}

export const SupportServer = '342983479501389826';

export const KillableMonsters = [
	{
		id: Monsters.Barrows.id,
		name: Monsters.Barrows.name,
		aliases: [],
		timeToFinish: Time.Minute * 4.15,
		table: Monsters.Barrows
	},
	{
		id: Monsters.DagannothPrime.id,
		name: Monsters.DagannothPrime.name,
		aliases: ['prime'],
		timeToFinish: Time.Minute * 2.1,
		table: Monsters.DagannothPrime
	},
	{
		id: Monsters.DagannothRex.id,
		name: Monsters.DagannothRex.name,
		aliases: ['rex'],
		timeToFinish: Time.Minute * 2.1,
		table: Monsters.DagannothRex
	},
	{
		id: Monsters.DagannothSupreme.id,
		name: Monsters.DagannothSupreme.name,
		aliases: ['supreme'],
		timeToFinish: Time.Minute * 2,
		table: Monsters.DagannothSupreme
	},
	{
		id: Monsters.Cerberus.id,
		name: Monsters.Cerberus.name,
		aliases: ['cerb'],
		timeToFinish: Time.Minute * 2.2,
		table: Monsters.Cerberus
	},
	{
		id: Monsters.GiantMole.id,
		name: Monsters.GiantMole.name,
		aliases: ['mole'],
		timeToFinish: Time.Minute * 1.6,
		table: Monsters.GiantMole
	},
	{
		id: Monsters.Vorkath.id,
		name: Monsters.Vorkath.name,
		aliases: ['vork'],
		timeToFinish: Time.Minute * 2.8,
		table: Monsters.Vorkath
	},
	{
		id: Monsters.Zulrah.id,
		name: Monsters.Zulrah.name,
		aliases: ['snek'],
		timeToFinish: Time.Minute * 2.6,
		table: Monsters.Zulrah
	}
];

export const enum Tasks {
	MonsterActivity = 'monsterActivity',
	ClueActivity = 'clueActivity'
}

export const enum Activity {
	MonsterKilling = 'MonsterKilling',
	ClueCompletion = 'ClueCompletion'
}

export const enum UserSettings {
	MinionName = 'minion.name',
	MinionHasBought = 'minion.hasBought',
	GP = 'GP',
	Bank = 'bank',
	CollectionLog = 'collectionLog',
	MonsterScores = 'monsterScores',
	ClueScores = 'clueScores'
}

export const enum Events {
	Debug = 'debug',
	Error = 'error',
	Log = 'log',
	Verbose = 'verbose',
	Warn = 'warn',
	Wtf = 'wtf'
}

export const Regex = {
	Yes: /^y|yes?|yeah?$/i
};

export const rootFolder = join(__dirname, '..', '..', '..');
