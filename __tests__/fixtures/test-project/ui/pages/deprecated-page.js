import React from 'react';
import { Button, Icon, Modal, TextField } from '../../components/component-library';

export const DeprecatedPage = () => {
  return (
    <div>
      <Button>Old Button</Button>
      <Icon name="check" />
      <Modal>
        <TextField label="Name" />
        <Button type="submit">Submit</Button>
      </Modal>
    </div>
  );
};
