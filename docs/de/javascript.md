![Logo](../../admin/birthdays.png)

# ioBroker.birthdays

Allgemeine Funktion um Nachrichten zu versenden

```javascript
async function sendText(text) {
    // Eigene Logik (pushover, telegram, ...)
    sendTo('pushover', 'send', {
        message: text,
        sound: '',
        title: 'Geburtstags-Kalender'
    });
}
```

## Erinnerung 1 Tag vor Geburtstag

```javascript
schedule('0 7 * * *', async () => {
    const nextDaysLeft = getState('birthdays.0.next.daysLeft').val;
    const nextText = getState('birthdays.0.next.text').val;

    const nextAfterDaysLeft = getState('birthdays.0.nextAfter.daysLeft').val;
    const nextAfterText = getState('birthdays.0.nextAfter.text').val;

    // Geburtstag heute
    if (nextDaysLeft == 0) {
        await sendText(`Geburtstage heute: ${nextText}`);

        // Falls morgen auch noch ein Geburtstag ansteht
        if (nextAfterDaysLeft == 1) {
            await sendText(`Geburtstage morgen: ${nextAfterText}`);
        }
    } else if (nextDaysLeft == 1) {
        await sendText(`Geburtstage morgen: ${nextText}`);
    }
});
```

## Erinnerung an Geburtstag in der kommenden Woche

```javascript
// Geburtstagserinnerung Anfang der Woche
schedule('0 7 * * 1', async () => {
    const summaryObj = JSON.parse(getState('birthdays.0.summary.json').val);

    const nextBirthdays = summaryObj
        .filter(b => b.daysLeft < 7)
        .map(b => `${b.name} wird am ${formatDate(new Date(b._nextBirthday), 'WW')} ${b.age}`);

    if (nextBirthdays.length > 0) {
        await sendText(`Geburtstage diese Woche: ${nextBirthdays.join(', ')}`);
    }
});
```
