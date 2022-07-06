![Logo](../../admin/birthdays.png)

# ioBroker.birthdays

## Erinnerung 1 Tag vor Geburtstag

```javascript
async function sendText(text) {
    // Eigene Logik (pushover, telegram, ...)
    sendTo('pushover', 'send', {
        message: text,
        sound: '',
        title: 'Geburtstags-Kalender'
    });
}

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
