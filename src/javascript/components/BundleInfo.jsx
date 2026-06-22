import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Chip, Separator, Typography, Warning} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import styles from './BundleDetails.scss';

// A11y B-018: use definition list for name/value pairs
const InfoRow = ({label, value}) => (
    <>
        <dt className={styles.infoLabel}>{label}</dt>
        <dd className={styles.infoValue}>{value}</dd>
    </>
);

InfoRow.propTypes = {label: PropTypes.string, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])};

// Normalise a value that may be an array, a comma/newline-separated string, or empty
const toArray = val => {
    if (!val || val.length === 0) {
        return [];
    }

    if (Array.isArray(val)) {
        return val.filter(Boolean);
    }

    return String(val).split(/[,\n]/).map(s => s.trim()).filter(Boolean);
};

// A11y B-006: use real heading element instead of styled Typography
const SectionTitle = ({children}) => (
    <h3 className={styles.sectionTitle}>
        {children}
    </h3>
);

SectionTitle.propTypes = {children: PropTypes.node};

const ChipGroup = ({items, color = 'default', getTitle, isColumn = false}) => (
    <div className={isColumn ? styles.chipGroupColumn : styles.chipGroup}>
        {items.map(item => (
            <Chip key={item}
                  variant="outlined"
                  label={item}
                  color={color}
                  title={getTitle ? getTitle(item) : undefined}/>
        ))}
    </div>
);

ChipGroup.propTypes = {
    items: PropTypes.arrayOf(PropTypes.string),
    color: PropTypes.string,
    getTitle: PropTypes.func,
    isColumn: PropTypes.bool
};

const BundleInfo = ({bundle}) => {
    const {t} = useTranslation('module-management-community');
    const [showManifest, setShowManifest] = useState(false);

    // Build manifest key→value lookup
    const mf = {};
    bundle.manifest?.forEach(({key, value}) => {
        mf[key] = value;
    });

    // Parse Bnd-LastModified (epoch ms) into a readable date
    let builtAt = mf['Bnd-LastModified'];
    if (builtAt && /^\d+$/.test(builtAt)) {
        builtAt = new Date(parseInt(builtAt, 10)).toLocaleString();
    }

    const services = toArray(bundle.services);
    const servicesInUse = toArray(bundle.servicesInUse);
    const moduleDeps = toArray(bundle.moduleDependencies);
    const nodeTypeDeps = toArray(bundle.nodeTypesDependencies);

    const mandatoryUnresolved = (bundle.unresolvedRequirements || []).filter(r => !r.optional);
    const missingCount = mandatoryUnresolved.filter(r => !r.hasProviders).length;
    const conflictCount = mandatoryUnresolved.filter(r => r.hasProviders).length;

    const identityFields = [
        {label: t('label.bundle.details.identity.name'), value: mf['Bundle-Name']},
        {label: t('label.bundle.details.identity.symbolicName'), value: bundle.symbolicName},
        {label: t('label.bundle.details.identity.description'), value: mf['Bundle-Description']},
        {label: t('label.bundle.details.identity.vendor'), value: mf['Bundle-Vendor']},
        {label: t('label.bundle.details.identity.version'), value: bundle.version},
        {label: t('label.bundle.details.identity.bundleId'), value: String(bundle.bundleId)},
        {label: t('label.bundle.details.identity.license'), value: bundle.license || mf['Bundle-License']},
        {label: t('label.bundle.details.identity.builtAt'), value: builtAt}
    ].filter(f => f.value);

    const hasServices = services.length > 0 || servicesInUse.length > 0;
    const hasDeps = moduleDeps.length > 0 || nodeTypeDeps.length > 0;

    return (
        <div className={styles.bundleInfo}>

            {/* A11y HIGH-11: banners present at mount — use polite status, not assertive alert */}
            {missingCount > 0 && (
                <div role="status" aria-live="polite" className={styles.unresolvedBannerDanger}>
                    <Warning aria-hidden="true"/>
                    <Typography variant="body">
                        {t('label.bundle.unresolvedReqs.bannerMissing', {count: missingCount})}
                    </Typography>
                </div>
            )}
            {missingCount === 0 && conflictCount > 0 && (
                <div role="status" aria-live="polite" className={styles.unresolvedBannerWarning}>
                    <Warning aria-hidden="true"/>
                    <Typography variant="body">
                        {t('label.bundle.unresolvedReqs.bannerConflict', {count: conflictCount})}
                    </Typography>
                </div>
            )}

            {/* ── Identity ── */}
            <section className={styles.infoSection}>
                <SectionTitle>{t('label.bundle.details.section.identity')}</SectionTitle>
                {/* A11y B-018 / C-010: dl with explicit div wrappers — works across all AT/browser combos */}
                <dl className={styles.identityGrid}>
                    {identityFields.map(({label, value}) => (
                        <div key={label} className={styles.identityRow}>
                            <dt className={styles.infoLabel}>{label}</dt>
                            <dd className={styles.infoValue}>{value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            {/* ── Runtime Services ── */}
            {hasServices && (
                <>
                    <Separator variant="horizontal" spacing="small"/>
                    <section className={styles.infoSection}>
                        <SectionTitle>{t('label.bundle.details.section.services')}</SectionTitle>
                        <div className={styles.servicesGrid}>
                            <div className={styles.servicesColumn}>
                                <Typography variant="caption" className={styles.columnLabel}>
                                    {t('label.bundle.details.services.provides')}
                                </Typography>
                                {services.length > 0 ? (
                                    <ChipGroup isColumn items={services} color="accent"/>
                                ) : (
                                    <Typography variant="caption" className={styles.emptyState}>
                                        {t('label.bundle.details.services.none')}
                                    </Typography>
                                )}
                            </div>
                            <div className={styles.servicesColumn}>
                                <Typography variant="caption" className={styles.columnLabel}>
                                    {t('label.bundle.details.services.consumes')}
                                </Typography>
                                {servicesInUse.length > 0 ? (
                                    <ChipGroup isColumn items={servicesInUse} color="default"/>
                                ) : (
                                    <Typography variant="caption" className={styles.emptyState}>
                                        {t('label.bundle.details.services.none')}
                                    </Typography>
                                )}
                            </div>
                        </div>
                    </section>
                </>
            )}

            {/* ── Dependencies ── */}
            {hasDeps && (
                <>
                    <Separator variant="horizontal" spacing="small"/>
                    <section className={styles.infoSection}>
                        <SectionTitle>{t('label.bundle.details.section.dependencies')}</SectionTitle>
                        {moduleDeps.length > 0 && (
                            <div className={styles.depsGroup}>
                                <Typography variant="caption" className={styles.columnLabel}>
                                    {t('label.bundle.details.dependencies.modules')}
                                </Typography>
                                <ChipGroup
                                    items={moduleDeps.map(d => d.split(' [')[0])}
                                    color="accent"
                                    getTitle={item => {
                                        const full = moduleDeps.find(d => d.split(' [')[0] === item);
                                        return full?.includes(' [') ? `Requires: ${full.slice(full.indexOf(' [') + 2, -1)}` : undefined;
                                    }}
                                />
                            </div>
                        )}
                        {nodeTypeDeps.length > 0 && (
                            <div className={styles.depsGroup}>
                                <Typography variant="caption" className={styles.columnLabel}>
                                    {t('label.bundle.details.dependencies.nodeTypes')}
                                </Typography>
                                <ChipGroup items={nodeTypeDeps} color="default"/>
                            </div>
                        )}
                    </section>
                </>
            )}

            {/* ── Full Manifest (collapsible) ── */}
            {bundle.manifest?.length > 0 && (
                <>
                    <Separator variant="horizontal" spacing="small"/>
                    <section className={styles.infoSection}>
                        {/* A11y B-023: aria-expanded + aria-controls on manifest toggle */}
                        <Button variant="ghost"
                                size="small"
                                color="default"
                                aria-expanded={showManifest}
                                aria-controls="manifest-table"
                                label={showManifest ?
                                    t('label.bundle.details.manifest.hide') :
                                    t('label.bundle.details.manifest.show')}
                                onClick={() => setShowManifest(v => !v)}/>
                        {/* A11y B-009: table with aria-label and scope="col" headers */}
                        {showManifest && (
                            <table id="manifest-table"
                                   className={styles.manifestTable}
                                   aria-label={t('label.bundle.details.manifest.tableLabel', 'Bundle manifest')}
                            >
                                <thead>
                                    <tr>
                                        <th scope="col">{t('label.bundle.details.manifest.col.key', 'Key')}</th>
                                        <th scope="col">{t('label.bundle.details.manifest.col.value', 'Value')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bundle.manifest.map(({key, value}) => (
                                        <tr key={key} className={styles.manifestRow}>
                                            <td className={styles.manifestKey}>{key}</td>
                                            <td className={styles.manifestValue}>{value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

BundleInfo.propTypes = {
    bundle: PropTypes.object.isRequired
};

export default BundleInfo;

