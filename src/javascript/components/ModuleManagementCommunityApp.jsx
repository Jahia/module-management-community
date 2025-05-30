import React, {useEffect} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {Button, Loader, Reload, Typography} from '@jahia/moonstone';
import styles from './ModuleManagementCommunityApp.scss';
import {
    Card,
    CardContent,
    CardHeader,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableSortLabel
} from '@material-ui/core';

const descendingComparator = (a, b, orderBy) => {
    if (!a[orderBy] && !b[orderBy]) {
        return 0;
    }

    if (!b[orderBy] || b[orderBy] < a[orderBy]) {
        return -1;
    }

    if (!a[orderBy] || b[orderBy] > a[orderBy]) {
        return 1;
    }

    return 0;
};

export const getComparator = (order, orderBy) => {
    return order === 'desc' ?
        (a, b) => descendingComparator(a, b, orderBy) :
        (a, b) => -descendingComparator(a, b, orderBy);
};

const ModuleManagementCommunityApp = () => {
    const notificationContext = useNotifications();
    const {t} = useTranslation('moduleManagementCommunity');
    const [order, setOrder] = React.useState('desc');
    const [orderBy, setOrderBy] = React.useState('name');
    const [modules, setModules] = React.useState([]);
    const {data, error, loading, refetch} = useQuery(gql`query {
        admin {
            modulesManagement {
                availableUpdates
            }
        }
    }`, {fetchPolicy: 'network-only'});

    const [updateAll] = useMutation(gql`mutation {
        admin {
            modulesManagement {
                updateModules
            }
        }
    }`);

    useEffect(() => {
        if (data && data.admin && data.admin.modulesManagement && data.admin.modulesManagement.availableUpdates) {
            const availableUpdates = data.admin.modulesManagement.availableUpdates.map((module => ({
                name: module.substring(0, module.indexOf('/')).trim(),
                version: module.substring(module.indexOf('/') + 1, module.indexOf(':')).trim(),
                available: module.substring(module.indexOf(':') + 1).trim()
            })));
            availableUpdates.sort(getComparator(order, orderBy));
            setModules(availableUpdates);
        }
    }, [data, order, orderBy]);

    if (error) {
        console.log('Error when fetching data: ' + error);
        notificationContext.notify(t('label.errors.loadingVanityUrl'), ['closeButton', 'noAutomaticClose']);
        return <>error</>;
    }

    if (loading) {
        return (
            <Card>
                <CardHeader title={
                    <Typography className={styles.title} variant="heading" weight="semiBold">
                        {t('label.table.title')}
                    </Typography>
            }/>
                <CardContent className={styles.flexCenter}>
                    <div className={styles.flex}>
                        <Loader size="big"/>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const handleClick = () => {
        notificationContext.notify(t('label.buttonClicked'), ['closeButton', 'noAutomaticClose']);
        refetch();
    };

    if (modules.length === 0) {
        return (
            <Card>
                <CardHeader title={
                    <Typography className={styles.title} variant="heading" weight="semiBold">
                        {t('label.table.title')}
                    </Typography>
                }/>
                <CardContent className={styles.flexCenter}>
                    <div className={styles.flex}>
                        <Typography variant="body" weight="semiBold">
                            {t('label.noUpdatesAvailable')}
                        </Typography>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const handleSort = property => {
        const isAsc = orderBy === property && order === 'asc';
        const sortOrder = isAsc ? 'desc' : 'asc';
        setOrderBy(property);
        const siteNodes = [...modules];
        siteNodes.sort(getComparator(sortOrder, property));
        setOrder(sortOrder);
        setOrderBy(property);
        setModules(siteNodes);
    };

    const handleUpdateAll = async () => {
        try {
            await updateAll();
            notificationContext.notify(t('label.updateAllSuccess'), ['closeButton', 'noAutomaticClose']);
            await refetch();
        } catch (e) {
            console.error('Error updating all modules:', e);
            notificationContext.notify(t('label.updateAllError'), ['closeButton', 'noAutomaticClose']);
        }
    };

    const tableHead = () => {
        return (
            <TableHead>
                <TableRow>
                    <TableCell>
                        <TableSortLabel
                            active={orderBy === 'name'}
                            classes={{icon: orderBy === 'name' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'name' ? order : 'asc'}
                            onClick={() => handleSort('name')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{t('label.table.cells.name')}
                            </Typography>
                        </TableSortLabel>
                    </TableCell>
                    <TableCell>
                        <TableSortLabel
                            active={orderBy === 'version'}
                            classes={{icon: orderBy === 'version' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'version' ? order : 'asc'}
                            onClick={() => handleSort('version')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{t('label.table.cells.version')}
                            </Typography>
                        </TableSortLabel>
                    </TableCell>
                    <TableCell>
                        <TableSortLabel
                            active={orderBy === 'available'}
                            classes={{icon: orderBy === 'available' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'available' ? order : 'asc'}
                            onClick={() => handleSort('available')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{t('label.table.cells.available')}
                            </Typography>
                        </TableSortLabel>
                    </TableCell>
                    <TableCell>
                        <Typography variant="body"
                                    weight="semiBold"
                        >{t('label.table.actions')}
                        </Typography>
                    </TableCell>
                </TableRow>
            </TableHead>
        );
    };

    return (
        <Card>
            <CardHeader title={
                <Typography className={styles.title} variant="heading" weight="semiBold">
                    {t('label.table.title')}
                </Typography>
            }
                        action={
                            <div className={styles.actionGroup}>
                                <Button variant="outlined"
                                        size="big"
                                        color="accent"
                                        label="Refresh"
                                        icon={<Reload/>}
                                        isDisabled={false}
                                        className={styles.button}
                                        onClick={handleClick}/>
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label="Update all"
                                        icon={<Reload/>}
                                        isDisabled={false}
                                        className={styles.button}
                                        onClick={handleUpdateAll}/>
                            </div>
                        }
                        classes={{action: styles.action}}
            />
            <CardContent>
                <Table>
                    {tableHead()}
                    <TableBody>
                        {modules.map(module => (
                            <TableRow key={module.name}>
                                <TableCell>
                                    {module.name}
                                </TableCell>
                                <TableCell>
                                    {module.version}
                                </TableCell>
                                <TableCell>
                                    {module.available}
                                </TableCell>
                                <TableCell>
                                    <Button isDisabled
                                            variant="outlined"
                                            size="big"
                                            color="accent"
                                            label={t('label.button.update')}
                                            className={styles.button}
                                            onClick={() => notificationContext.notify(`${module.name} updated to ${module.available}`, ['closeButton', 'noAutomaticClose'])}/>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default ModuleManagementCommunityApp;
