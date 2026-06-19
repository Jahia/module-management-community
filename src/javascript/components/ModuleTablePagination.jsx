import React from 'react';
import * as PropTypes from 'prop-types';
import {Button, Typography} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityApp.scss';

/**
 * Pagination footer for the modules table.
 * Shows item count info, a page-size selector and Previous / Next buttons.
 */
export const ModuleTablePagination = ({
    currentPage,
    itemsPerPage,
    totalItems,
    onPageChange,
    onItemsPerPageChange
}) => {
    const {t} = useTranslation('module-management-community');
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return (
        <div className={styles.paginationContainer}>
            <Typography variant="body" className={styles.paginationInfo}>
                {t('label.pagination.showing', {
                    from: Math.min(((currentPage - 1) * itemsPerPage) + 1, totalItems),
                    to: Math.min(currentPage * itemsPerPage, totalItems),
                    total: totalItems
                })}
            </Typography>
            <div className={styles.paginationControls}>
                <Button variant="ghost"
                        size="small"
                        label={t('label.pagination.previous')}
                        isDisabled={currentPage === 1}
                        onClick={() => onPageChange(p => Math.max(p - 1, 1))}/>
                {/* A11y A-005: programmatic label for items-per-page selector */}
                <label htmlFor="items-per-page" className={styles.srOnly}>
                    {t('label.pagination.itemsPerPage', 'Items per page')}
                </label>
                <select id="items-per-page"
                        value={itemsPerPage}
                        className={styles.itemsPerPageSelect}
                        aria-label={t('label.pagination.itemsPerPage', 'Items per page')}
                        onChange={e => {
                            onItemsPerPageChange(Number(e.target.value));
                            onPageChange(1);
                        }}
                >
                    <option value={20}>20</option>
                    <option value={40}>40</option>
                    <option value={60}>60</option>
                </select>
                <Button variant="ghost"
                        size="small"
                        label={t('label.pagination.next')}
                        isDisabled={currentPage >= totalPages}
                        onClick={() => onPageChange(p => Math.min(p + 1, totalPages))}/>
            </div>
        </div>
    );
};

ModuleTablePagination.propTypes = {
    currentPage: PropTypes.number.isRequired,
    itemsPerPage: PropTypes.number.isRequired,
    totalItems: PropTypes.number.isRequired,
    onPageChange: PropTypes.func.isRequired,
    onItemsPerPageChange: PropTypes.func.isRequired
};
