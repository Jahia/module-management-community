import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Chip, Typography, Warning} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import styles from './BundleDetails.scss';

const NAMESPACE_SHORT = {
    'osgi.wiring.package': 'label.bundle.unresolvedReqs.ns.package',
    'osgi.wiring.bundle': 'label.bundle.unresolvedReqs.ns.bundle',
    'osgi.wiring.host': 'label.bundle.unresolvedReqs.ns.host',
    'com.jahia.modules.dependencies': 'label.bundle.unresolvedReqs.ns.module',
    'com.jahia.services.content': 'label.bundle.unresolvedReqs.ns.nodeType'
};

const extractName = (ns, filter) => {
    if (!filter) {
        return '—';
    }

    const escaped = ns.replace(/\./g, '\\.');
    const m = filter.match(new RegExp(`\\(${escaped}=([^)]+)\\)`));
    return m ? m[1] : filter;
};

const extractVersion = filter => {
    if (!filter) {
        return null;
    }

    const lower = filter.match(/version>=([^)]+)/)?.[1];
    const upper = filter.match(/!\(version>=([^)]+)\)/)?.[1];
    if (lower && upper) {
        return `[${lower}, ${upper})`;
    }

    if (lower) {
        return `≥ ${lower}`;
    }

    return null;
};

const UnresolvedRequirementsTab = ({bundle}) => {
    const {t} = useTranslation('module-management-community');
    const [nsFilter, setNsFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [reqSearch, setReqSearch] = useState('');

    const allReqsRaw = (bundle.unresolvedRequirements || []).filter(r => !r.optional);

    // Deduplicate by namespace + logical name: multiple OSGi wires can exist for the
    // same logical dependency (e.g. one com.jahia.modules.dependencies entry per package
    // imported from a Jahia module). Keep the first occurrence of each unique pair.
    const allReqs = allReqsRaw.reduce((acc, req) => {
        const key = `${req.namespace}::${extractName(req.namespace, req.filter)}`;
        if (!acc.seen.has(key)) {
            acc.seen.add(key);
            acc.list.push(req);
        }

        return acc;
    }, {seen: new Set(), list: []}).list;
    const namespaces = [...new Set(allReqs.map(r => r.namespace))].sort();
    const missing = allReqs.filter(r => !r.hasProviders);
    const conflicting = allReqs.filter(r => r.hasProviders);

    const nsLabel = ns => t(NAMESPACE_SHORT[ns] || ns.split('.').pop());

    const reqs = allReqs.filter(r => {
        if (nsFilter && r.namespace !== nsFilter) {
            return false;
        }

        if (statusFilter === 'missing' && r.hasProviders) {
            return false;
        }

        if (statusFilter === 'conflict' && !r.hasProviders) {
            return false;
        }

        if (reqSearch) {
            const name = extractName(r.namespace, r.filter);
            const search = reqSearch.toLowerCase();
            if (!name.toLowerCase().includes(search) && !(r.filter || '').toLowerCase().includes(search)) {
                return false;
            }
        }

        return true;
    });

    const hasActiveFilter = Boolean(nsFilter || statusFilter || reqSearch);

    return (
        <div className={styles.unresolvedReqsTab}>
            {missing.length > 0 && (
                <div className={styles.unresolvedAlertDanger}>
                    <Warning/>
                    <Typography variant="body">
                        {t('label.bundle.unresolvedReqs.alertMissing', {count: missing.length})}
                    </Typography>
                </div>
            )}
            {conflicting.length > 0 && (
                <div className={styles.unresolvedAlertWarning}>
                    <Warning/>
                    <Typography variant="body">
                        {t('label.bundle.unresolvedReqs.alertConflict', {count: conflicting.length})}
                    </Typography>
                </div>
            )}

            {/* ── Filter bar ── */}
            <div className={styles.unresolvedFilterBar}>
                <select
                    className={styles.unresolvedFilterSelect}
                    value={nsFilter}
                    onChange={e => setNsFilter(e.target.value)}
                >
                    <option value="">{t('label.bundle.unresolvedReqs.filter.allTypes')}</option>
                    {namespaces.map(ns => (
                        <option key={ns} value={ns}>{nsLabel(ns)}</option>
                    ))}
                </select>

                <input
                    type="text"
                    className={styles.unresolvedFilterSearch}
                    placeholder={t('label.bundle.unresolvedReqs.filter.searchReq')}
                    value={reqSearch}
                    onChange={e => setReqSearch(e.target.value)}
                />

                <select
                    className={styles.unresolvedFilterSelect}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="">{t('label.bundle.unresolvedReqs.filter.allStatuses')}</option>
                    <option value="missing">{t('label.bundle.unresolvedReqs.status.missing')}</option>
                    <option value="conflict">{t('label.bundle.unresolvedReqs.status.conflict')}</option>
                </select>

                {hasActiveFilter && (
                    <button
                        className={styles.unresolvedFilterClear}
                        type="button"
                        onClick={() => {
                            setNsFilter('');
                            setStatusFilter('');
                            setReqSearch('');
                        }}
                    >
                        {t('label.bundle.unresolvedReqs.filter.clear')}
                    </button>
                )}

                <Typography variant="caption" className={styles.unresolvedFilterCount}>
                    {t('label.bundle.unresolvedReqs.filter.showing', {count: reqs.length, total: allReqs.length})}
                </Typography>
            </div>

            {/* ── Table ── */}
            {reqs.length === 0 ? (
                <Typography variant="body" className={styles.emptyState}>
                    {t('label.bundle.unresolvedReqs.filter.noResults')}
                </Typography>
            ) : (
                <table className={styles.unresolvedTable}>
                    <thead>
                        <tr>
                            <th className={styles.unresolvedThNs}>{t('label.bundle.unresolvedReqs.col.namespace')}</th>
                            <th className={styles.unresolvedThReq}>{t('label.bundle.unresolvedReqs.col.requirement')}</th>
                            <th className={styles.unresolvedThStatus}>{t('label.bundle.unresolvedReqs.col.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reqs.map(req => {
                            const name = extractName(req.namespace, req.filter);
                            const version = extractVersion(req.filter);
                            const rowKey = `${req.namespace}::${req.filter}`;
                            return (
                                <tr key={rowKey} className={styles.unresolvedRow}>
                                    <td className={styles.unresolvedCellNs}>
                                        <Chip variant="outlined"
                                              label={nsLabel(req.namespace)}
                                              color="default"
                                              title={req.namespace}/>
                                    </td>
                                    <td className={styles.unresolvedCellReq}>
                                        <span className={styles.unresolvedReqName}>{name}</span>
                                        {version && (
                                            <span className={styles.unresolvedReqVersion}>{version}</span>
                                        )}
                                        <code className={styles.unresolvedFilter} title={req.filter}>{req.filter}</code>
                                    </td>
                                    <td className={styles.unresolvedCellStatus}>
                                        <Chip variant="outlined"
                                              label={req.hasProviders ?
                                                  t('label.bundle.unresolvedReqs.status.conflict') :
                                                  t('label.bundle.unresolvedReqs.status.missing')}
                                              color={req.hasProviders ? 'warning' : 'danger'}
                                              title={req.hasProviders ?
                                                  t('label.bundle.unresolvedReqs.status.conflictHint') :
                                                  t('label.bundle.unresolvedReqs.status.missingHint')}/>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

UnresolvedRequirementsTab.propTypes = {
    bundle: PropTypes.object.isRequired
};

export default UnresolvedRequirementsTab;

