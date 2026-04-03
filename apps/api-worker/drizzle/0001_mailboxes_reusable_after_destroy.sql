DROP INDEX IF EXISTS `mailboxes_address_unique`;
CREATE UNIQUE INDEX `mailboxes_address_active_unique`
ON `mailboxes` (`address`)
WHERE `status` <> 'destroyed';
